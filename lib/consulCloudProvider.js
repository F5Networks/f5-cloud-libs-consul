/**
 * Copyright 2018 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const util = require('util');

const CloudProvider = require('@f5devcentral/f5-cloud-libs').cloudProvider;
const GenericNodeProvider = require('@f5devcentral/f5-cloud-libs').genericNodeProvider;
const Logger = require('@f5devcentral/f5-cloud-libs').logger;
const cloudUtil = require('@f5devcentral/f5-cloud-libs').util;
const cryptoUtil = require('@f5devcentral/f5-cloud-libs').cryptoUtil;

let logger;

util.inherits(ConsulCloudProvider, CloudProvider);

/**
 * Constructor
 * @class
 * @classdesc
 * Consul cloud provider implementation.
 *
 * @param {Object} [options]               - Options for the instance.
 * @param {Object} [options.clOptions]     - Command line options if called from a script.
 * @param {Object} [options.logger]        - Logger to use. Or, pass loggerOptions to get your own logger.
 * @param {Object} [options.loggerOptions] - Options for the logger.
 *                                           See {@link module:logger.getLogger} for details.
 */
function ConsulCloudProvider(options) {
    ConsulCloudProvider.super_.call(this, options);

    this.loggerOptions = options ? options.loggerOptions : undefined;

    logger = options ? options.logger : undefined;

    if (logger) {
        this.logger = logger;
        cloudUtil.setLogger(logger);
        cryptoUtil.setLogger(logger);
    } else if (this.loggerOptions) {
        this.loggerOptions.module = module;
        logger = Logger.getLogger(this.loggerOptions);
        cloudUtil.setLoggerOptions(this.loggerOptions);
        cryptoUtil.setLoggerOptions(this.loggerOptions);
        this.logger = logger;
    } else {
        // use super's logger
        logger = this.logger;
        cloudUtil.setLogger(logger);
        cryptoUtil.setLogger(logger);
    }
}


/**
 * Initialize class
 *
 * Override for implementation specific initialization needs (read info
 * from cloud provider, read database, etc.). Called at the start of
 * processing.
 *
 * @param {Object}  [providerOptions]                 - Provider specific options.
 * @param {String}  [providerOptions.secret]          - Base64 encoded Consul credentials.
 * @param {Object}  [options]                         - Options for this instance.
 *
 * @returns {Promise} A promise which will be resolved when init is complete.
 */
ConsulCloudProvider.prototype.init = function init(providerOptions, options) {
    this.initOptions = options || {};
    this.providerOptions = providerOptions || {};

    if (this.providerOptions.secret) {
        this.token = cloudUtil.createBufferFrom(providerOptions.secret, 'base64').toString();
    }

    this.nodeProvider = new GenericNodeProvider({ logger: this.logger });

    return this.nodeProvider.init({
        propertyPathId: 'ID',
        propertyPathIpPrivate: 'Address',
        propertyPathIpPublic: 'Address'
    });
};

/**
 * Gets nodes from the provided URI. The resource should be in JSON
 * format as an array of objects. JSON strings that parse to an array
 * of objects are also supported.
 *
 * @param {String} uri               - The URI of the resource.
 * @param {Object} [options]         - Optional parameters
 * @param {Object} [options.headers] - Map of headers to add to the request. Format:
 *
 *     {
 *         <header1_name>: <header1_value>,
 *         <header2_name>: <header2_value>
 *     }
 *
 * @returns {Promise} A promise which will be resolved with an array of instances.
 *                    Each instance value should be:
 *
 *     {
 *         id: Node ID,
 *         ip: {
 *             public: public IP,
 *             private: private IP
 *         }
 *     }
 */
ConsulCloudProvider.prototype.getNodesFromUri = function getNodesFromUri(uri, options) {
    const opts = options || {};
    opts.headers = opts.headers || {};

    if (this.token) {
        opts.headers['X-Consul-Token'] = this.token;
    }

    return this.nodeProvider.getNodesFromUri(uri, opts);
};

module.exports = ConsulCloudProvider;
