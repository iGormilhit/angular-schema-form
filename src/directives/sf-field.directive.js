import angular from 'angular';

export default function($parse, $compile, $http, $templateCache, $interpolate, $q, sfErrorMessage,
sfPath, sfSelect) {

  const keyFormat = {
    COMPLETE: '*',
    PATH: 'string',
    INDICES: 'number'
  };

  return {
    restrict: 'AE',
    replace: false,
    transclude: false,
    scope: true,
    require: ['^sfSchema', '?^form', '?^^sfKeyController'],
    link: {
      pre: function(scope, element, attrs, ctrl) {
        let sfSchema = ctrl[0];
        let formCtrl = ctrl[1];
        let keyCtrl = ctrl[2];

        //The ngModelController is used in some templates and
        //is needed for error messages,
        scope.$on('schemaFormPropagateNgModelController', function(event, ngModel) {
          event.stopPropagation();
          event.preventDefault();
          scope.ngModel = ngModel;
        });

        // Fetch our form.
        scope.initialForm = Object.assign({}, sfSchema.lookup['f' + attrs.sfField]);
        scope.form = sfSchema.lookup['f' + attrs.sfField];
      },
      post: function(scope, element, attrs, ctrl) {
        var sfSchema = ctrl[0];
        var formCtrl = ctrl[1];
        var keyCtrl = ctrl[2];

        scope.getKey = function(requiredFormat) {
          let format = requiredFormat || keyFormat.COMPLETE;
          let key = (scope.parentKey) ? scope.parentKey.slice(0, scope.parentKey.length-1) : [] ;

          // Only calculate completeKey if not already saved to form.key
          if(scope.completeKey !== scope.form.key) {
            if (typeof scope.$index === 'number') {
              key = key.concat(scope.$index);
            };

            if(scope.form.key && scope.form.key.length) {
              if(typeof key[key.length-1] === 'number' && scope.form.key.length >= 1) {
                let trim = scope.form.key.length - key.length;
                scope.completeKey = key.concat(scope.form.key.slice(-trim));
              }
              else {
                scope.completeKey = scope.form.key.slice();
              };
            };
          };

          // If there is no key then there's nothing to return
          if(!Array.isArray(scope.completeKey)) {
            return undefined;
          };

          // return the full key if not omiting any types via reduce
          if (format === keyFormat.COMPLETE) {
            return scope.completeKey;
          }
          else {
            // else to clearly show that data must be ommited
            return scope.completeKey.reduce((output, input, i) => {
              if (-1 !== [ format ].indexOf((typeof input))) {
                return output.concat(input);
              }
              return output;
            }, []);
          };
        };
        // Now that getKey is defined, run it! ...if there's a key.
        if(scope.form.key) {
          scope.form.key = scope.completeKey = scope.getKey();
        };

        //Keep error prone logic from the template
        scope.showTitle = function() {
          return scope.form && scope.form.notitle !== true && scope.form.title;
        };

        //Normalise names and ids
        scope.fieldId = function(prependFormName, omitArrayIndexes) {
          let omit = omitArrayIndexes || false;
          let formName = (prependFormName && formCtrl && formCtrl.$name) ? formCtrl.$name : undefined;
          let key = scope.completeKey;

          if(Array.isArray(key)) {
            return sfPath.name(key, '-', formName, omit);
          }
          else {
            return '';
          };
        };

        scope.listToCheckboxValues = function(list) {
          var values = {};
          angular.forEach(list, function(v) {
            values[v] = true;
          });
          return values;
        };

        scope.checkboxValuesToList = function(values) {
          var lst = [];
          angular.forEach(values, function(v, k) {
            if (v) {
              lst.push(k);
            }
          });
          return lst;
        };

        scope.buttonClick = function($event, form) {
          if (angular.isFunction(form.onClick)) {
            form.onClick($event, form);
          } else if (angular.isString(form.onClick)) {
            if (sfSchema) {
              //evaluating in scope outside of sfSchemas isolated scope
              sfSchema.evalInParentScope(form.onClick, { '$event': $event, form: form });
            } else {
              scope.$eval(form.onClick, { '$event': $event, form: form });
            }
          }
        };

        /**
         * Evaluate an expression, i.e. scope.$eval
         * but do it in sfSchemas parent scope sf-schema directive is used
         *
         * @param {string} expression
         * @param {Object} locals (optional)
         * @return {Any} the result of the expression
         */
        scope.evalExpr = function(expression, locals) {
          if (sfSchema) {
            //evaluating in scope outside of sfSchemas isolated scope
            return sfSchema.evalInParentScope(expression, locals);
          }

          return scope.$eval(expression, locals);
        };

        /**
         * Evaluate an expression, i.e. scope.$eval
         * in this decorators scope
         *
         * @param {string} expression
         * @param {Object} locals (optional)
         * @return {Any} the result of the expression
         */
        scope.evalInScope = function(expression, locals) {
          if (expression) {
            return scope.$eval(expression, locals);
          }
        };

        /**
         * Interpolate the expression.
         * Similar to `evalExpr()` and `evalInScope()`
         * but will not fail if the expression is
         * text that contains spaces.
         *
         * Use the Angular `{{ interpolation }}`
         * braces to access properties on `locals`.
         *
         * @param  {string} expression The string to interpolate.
         * @param  {Object} locals (optional) Properties that may be accessed in the
         *                         `expression` string.
         * @return {Any} The result of the expression or `undefined`.
         */
        scope.interp = function(expression, locals) {
          return (expression && $interpolate(expression)(locals));
        };

        //This works since we get the ngModel from the array or the schema-validate directive.
        scope.hasSuccess = function() {
          if (!scope.ngModel) {
            return false;
          }
          if (scope.options && scope.options.pristine &&
              scope.options.pristine.success === false) {
            return scope.ngModel.$valid &&
                !scope.ngModel.$pristine && !scope.ngModel.$isEmpty(scope.ngModel.$modelValue);
          } else {
            return scope.ngModel.$valid &&
              (!scope.ngModel.$pristine || !scope.ngModel.$isEmpty(scope.ngModel.$modelValue));
          }
        };

        scope.hasError = function() {
          if (!scope.ngModel) {
            return false;
          }
          if (!scope.options || !scope.options.pristine || scope.options.pristine.errors !== false) {
            // Show errors in pristine forms. The default.
            // Note that "validateOnRender" option defaults to *not* validate initial form.
            // so as a default there won't be any error anyway, but if the model is modified
            // from the outside the error will show even if the field is pristine.
            return scope.ngModel.$invalid;
          } else {
            // Don't show errors in pristine forms.
            return scope.ngModel.$invalid && !scope.ngModel.$pristine;
          }
        };

        /**
         * DEPRECATED: use sf-messages instead.
         * Error message handler
         * An error can either be a schema validation message or a angular js validtion
         * error (i.e. required)
         */
        scope.errorMessage = function(schemaError) {
          return sfErrorMessage.interpolate(
            (schemaError && schemaError.code + '') || 'default',
            (scope.ngModel && scope.ngModel.$modelValue) || '',
            (scope.ngModel && scope.ngModel.$viewValue) || '',
            scope.form,
            scope.options && scope.options.validationMessage
          );
        };

        // append the field-id to the htmlClass
        scope.form.htmlClass = scope.form.htmlClass || '';
        scope.idClass = scope.fieldId(false) + ' ' + scope.fieldId(false, true);

        var form = scope.form;

        // Where there is a key there is probably a ngModel
        if (form.key) {
          // It looks better with dot notation.
          scope.$on(
            'schemaForm.error.' + form.key.join('.'),
            function(event, error, validationMessage, validity, formName) {
              // validationMessage and validity are mutually exclusive
              formName = validity;
              if (validationMessage === true || validationMessage === false) {
                validity = validationMessage;
                validationMessage = undefined;
              };

              // If we have specified a form name, and this model is not within
              // that form, then leave things be.
              if (formName != undefined && scope.ngModel.$$parentForm.$name !== formName) {
                return;
              };

              if (scope.ngModel && error) {
                if (scope.ngModel.$setDirty) {
                  scope.ngModel.$setDirty();
                }
                else {
                  // FIXME: Check that this actually works on 1.2
                  scope.ngModel.$dirty = true;
                  scope.ngModel.$pristine = false;
                }

                // Set the new validation message if one is supplied
                // Does not work when validationMessage is just a string.
                if (validationMessage) {
                  if (!form.validationMessage) {
                    form.validationMessage = {};
                  }
                  form.validationMessage[error] = validationMessage;
                }

                scope.ngModel.$setValidity(error, validity === true);

                if (validity === true) {
                  // Re-trigger model validator, that model itself would be re-validated
                  scope.ngModel.$validate();

                  // Setting or removing a validity can change the field to believe its valid
                  // but its not. So lets trigger its validation as well.
                  scope.$broadcast('schemaFormValidate');
                }
              }
            }
          );

          // Clean up the model when the corresponding form field is $destroy-ed.
          // Default behavior can be supplied as a globalOption, and behavior can be overridden
          // in the form definition.
          scope.$on('$destroy', function() {
            let key = scope.getKey();
            let arrayIndex = (typeof scope.arrayIndex == 'number') ? scope.arrayIndex + 1: 0;

            // If the entire schema form is destroyed we don't touch the model
            if (!scope.externalDestructionInProgress) {
              var destroyStrategy = form.destroyStrategy ||
                                    (scope.options && scope.options.destroyStrategy) || 'remove';
              // No key no model, and we might have strategy 'retain'
              if (key && destroyStrategy !== 'retain') {

                // Get the object that has the property we wan't to clear.
                var obj = scope.model;
                if (key.length > 1) {
                  obj = sfSelect(key.slice(0, key.length - 1), obj);
                }

                if(obj && scope.destroyed && obj.$$hashKey && obj.$$hashKey !== scope.destroyed) {
                  return;
                }

                // We can get undefined here if the form hasn't been filled out entirely
                if (obj === undefined) {
                  return;
                }

                // Type can also be a list in JSON Schema
                var type = (form.schema && form.schema.type) || '';

                // Empty means '',{} and [] for appropriate types and undefined for the rest
                //console.log('destroy', destroyStrategy, key, type, obj);
                if (destroyStrategy === 'empty' && type.indexOf('string') !== -1) {
                  obj[key.slice(-1)] = '';
                } else if (destroyStrategy === 'empty' && type.indexOf('object') !== -1) {
                  obj[key.slice(-1)] = {};
                } else if (destroyStrategy === 'empty' && type.indexOf('array') !== -1) {
                  obj[key.slice(-1)] = [];
                } else if (destroyStrategy === 'null') {
                  obj[key.slice(-1)] = null;
                } else {
                  delete obj[key.slice(-1)];
                }
              }
            }
          });
        }
      }
    }
  };
}
