const debug = require('debug')('pinary:server:methods:handler');
const errors = require('../errors');

function triggerError(msg, callback) {
    callback({ code:errors.ERROR_CODE_PARAMETER, message:msg });
    debug(msg);
}

function triggerErrorInternal(msg, callback) {
    callback({ code:errors.ERROR_CODE_INTERNAL, message:msg });
    debug(msg);
}

function Method(descriptor, handler) {

    let descriptorPropertiesCount = 0;
    if (descriptor.properties) {
        descriptorPropertiesCount = Object.keys(descriptor.properties).length;
    }

    if (!descriptor.required) {
        descriptor.required = [];
    }

    if (!descriptor.oneOf) {
        descriptor.oneOf = [];
    }

    function unwantedProperties(params) {
        if (
            params
            && Object.keys(params).length>0
            && (!descriptor.properties || !Object.keys(descriptor.properties).length)
        ) {
            return true;
        }
        return false;
    }

    function handle(params, context, callback) {

        if (!callback) {
            callback = context;
            context = this;
        }

        if (!params) params = {};

        // request has parameters, but the descriptor don't have
        if (unwantedProperties(params)) {
            triggerError(`method "${descriptor.name}" does NOT wait for any property`, callback);
            return;
        }

        const paramsCount = Object.keys(params).length;

        // request has no parameters, as specified in the descriptor
        if (descriptorPropertiesCount === 0 && paramsCount === 0) {
            handler(params, context, callback);
            return;
        }

        // request has more parameters than expected in the descriptor
        if (paramsCount>descriptorPropertiesCount) {
            triggerError(`method "${descriptor.name}": too many properties, expected ${descriptorPropertiesCount}, find ${paramsCount}`, callback);
            return;
        }

        let property;
        for (const prop in descriptor.properties) {
            property = descriptor.properties[prop];
            if (property.alias && property.alias.length) {
                for (const alias of property.alias) {
                    if (params[alias] != undefined) {
                        params[prop] = params[alias];
                        delete params[alias];
                    }
                }
            }
        }

        for (const prop in descriptor.properties) {

            property = descriptor.properties[prop];

            // a mandatory property is missing
            if (descriptor.required.indexOf(prop)>=0 && params[prop] === undefined) {
                if (property.alias) {
                    triggerError(`method "${descriptor.name}": property ${prop} (alias ${property.alias}) is mandatory`, callback);
                } else {
                    triggerError(`method "${descriptor.name}": property ${prop} is mandatory`, callback);
                }
                return;
            }

            // non mandatory property
            if (params[prop] === undefined) {
                continue;
            }

            // check type
            if (property.type != typeof params[prop]) {
                triggerError(`method "${descriptor.name}": property "${prop}" should be a ${property.type}, found ${typeof params[prop]}`, callback);
                return;
            }

            if (property.type === 'string') {
                if (property.pattern) {
                    // patternRe is the compiled version of the regexp, see _compileDescriptorParametersRegexp
                    if (!property.patternRe.test(params[prop])) {
                        triggerError(`method "${descriptor.name}": property "${prop}" does not match regular expression ${property.pattern}`, callback);
                        return;
                    }
                }
            }

            if (property.type === 'number') {
                // greater than
                if (typeof property.minimum === 'number' && params[prop]<property.minimum) {
                    triggerError(`method "${descriptor.name}": property "${prop}" should be > ${property.minimum}`, callback);
                    return;
                }
                // lower than
                if (typeof property.maximum === 'number' && params[prop]>property.maximum) {
                    triggerError(`method "${descriptor.name}": property "${prop}" should be < ${property.maximum}`, callback);
                    return;
                }
            }
        }

        if (descriptor.oneOf.length) {
            let oneOfMatch = false;
            let multipleOneOfFound = false;
            let oneOfStr = [];
            let strs = [];

            for (const oneof of descriptor.oneOf) {
                let found = 0;
                for (const requiredProperty of oneof.required) {
                    strs.push(requiredProperty);
                    if (params[requiredProperty] != undefined) {
                        found++;
                    }
                }
                if (found === descriptor.oneOf.length) {
                    if (!oneOfMatch) {
                        oneOfMatch = true;
                    } else {
                        multipleOneOfFound = true;
                    }
                }
                oneOfStr.push(strs.join(', '));
                strs = [];
            }

            oneOfStr = oneOfStr.join('" OR "');

            if (multipleOneOfFound) {
                triggerError(`method "${descriptor.name}": mandatory properties conflict, please specify properties "${oneOfStr}"`, callback);
                return;
            }

            if (!oneOfMatch) {
                triggerError(`method "${descriptor.name}": mandatory properties are missing (at least "${oneOfStr}")`, callback);
                return;
            }
        }

        //
        // Sanity Check passed successfully
        //

        handler(params, context, callback);
    }

    function getDescriptor() {
        return descriptor;
    }

    function _compileDescriptorParametersRegexp() {

        if (!descriptorPropertiesCount) {
            return;
        }

        for (const prop in descriptor.properties) {
            if (descriptor.properties[prop].pattern) {
                descriptor.properties[prop].patternRe = new RegExp(
                    descriptor.properties[prop].pattern,
                    descriptor.properties[prop].patternFlag||''
                );
            }
        }

    }

    // precompile regular expressions
    _compileDescriptorParametersRegexp();

    return {
        name:descriptor.name,
        handle,
        getDescriptor
    };
}

function internalError(msg) {
    return {
        code: errors.ERROR_CODE_INTERNAL,
        message: msg
    };
}

function parameterError(msg) {
    return {
        code: errors.ERROR_CODE_PARAMETER,
        message: msg
    };
}

module.exports = {
    Method,
    internalError,
    parameterError
};
