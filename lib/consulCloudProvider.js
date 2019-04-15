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
const path = require('path');
const fs = require('fs');
const q = require('q');

const CloudProvider = require('@f5devcentral/f5-cloud-libs').cloudProvider;
const GenericNodeProvider = require('@f5devcentral/f5-cloud-libs').genericNodeProvider;
const Logger = require('@f5devcentral/f5-cloud-libs').logger;
const cloudUtil = require('@f5devcentral/f5-cloud-libs').util;
const cryptoUtil = require('@f5devcentral/f5-cloud-libs').cryptoUtil;
const localKeyUtil = require('@f5devcentral/f5-cloud-libs').localKeyUtil;

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
 * @param {Object}  [providerOptions]          - Provider specific options.
 * @param {String}  [providerOptions.secret]   - Base64 encoded Consul credentials.
 * @param {String}  [providerOptions.caBundle] - Absolute TMSH path to a bundle of one or more
 *                                               trusted CA certificates in PEM format that
 *                                               overrides the default Nodejs certificates.
 *
 *     "/Common/myCert.pem"
 *
 * @param {Boolean} [providerOptions.rejectUnauthorized=true] - The server certificate is verified
 *                                                              against the list of supplied/default
 *                                                              CAs when fetching nodes.
 * @param {Object}  [options]                  - Options for this instance.
 *
 * @returns {Promise} A promise which will be resolved when init is complete.
 */
ConsulCloudProvider.prototype.init = function init(providerOptions, options) {
    const promises = [];

    this.initOptions = options || {};
    this.providerOptions = providerOptions || {};

    if (this.providerOptions.secret) {
        this.token = cloudUtil.createBufferFrom(providerOptions.secret, 'base64').toString();
    }

    if (this.providerOptions.caBundle) {
        this.caBundleTmshPath = this.providerOptions.caBundle;
        // Check to make sure the CA bundle exists
        promises.push(
            getCertFilePath(this.providerOptions.caBundle)
                .catch((err) => {
                    err.message = `caBundle: ${err.message}`; // eslint-disable-line no-param-reassign
                    return q.reject(err);
                })
        );
    }

    this.rejectUnauthorized = true;
    if (typeof this.providerOptions.rejectUnauthorized === 'boolean') {
        this.rejectUnauthorized = this.providerOptions.rejectUnauthorized;
    }

    return q.all(promises)
        .then(() => {
            this.nodeProvider = new GenericNodeProvider({ logger: this.logger });

            return this.nodeProvider.init({
                propertyPathId: '',
                propertyPathIpPrivate: 'Address',
                propertyPathIpPublic: 'Address'
            });
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
    const promises = [];
    const opts = options || {};

    if (this.token) {
        opts.headers = opts.headers || {};
        opts.headers['X-Consul-Token'] = this.token;
    }

    if (this.caBundleTmshPath) {
        const caPromise = getCertFilePath(this.caBundleTmshPath)
            .then((caBundleFilePath) => {
                const deferred = q.defer();
                fs.readFile(caBundleFilePath, (err, data) => {
                    if (err) {
                        deferred.reject(err);
                    }
                    deferred.resolve(data);
                });
                return deferred.promise;
            })
            .then((caBundleData) => {
                opts.ca = caBundleData;
            })
            .catch((err) => {
                err.message = `caBundle: ${err.message}`; // eslint-disable-line no-param-reassign
                return q.reject(err);
            });
        promises.push(caPromise);
    }

    opts.rejectUnauthorized = this.rejectUnauthorized;

    return q.all(promises)
        .then(() => {
            return this.nodeProvider.getNodesFromUri(uri, opts);
        })
        .then((nodes) => {
            return nodes.map((node) => {
                return {
                    id: node.id.ID || node.id.Node,
                    ip: node.ip
                };
            });
        });
};

/**
 * @param {String} name - Absolute TMSH path to certificate.
 *
 *     "/Common/myCert.pem"
 *
 * @returns {Promise} A promise which will be resolved with a file path to the certificate.
 */
function getCertFilePath(tmshPath) {
    if (!path.isAbsolute(tmshPath)) {
        return q.reject(new Error('TMSH path must be an absolute path'));
    }

    const splitPath = path.normalize(tmshPath).split(path.sep);
    return localKeyUtil.getKeyFilePath(splitPath[1], 'certificate', splitPath.slice(2).join(':'))
        .then((filePath) => {
            if (typeof filePath !== 'string') {
                return q.reject(new Error('certificate does not exist'));
            }
            return q.resolve(filePath);
        });
}

module.exports = ConsulCloudProvider;
