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

const q = require('q');

const cloudUtil = require('@f5devcentral/f5-cloud-libs').util;
const ConsulCloudProvider = require('../../lib/consulCloudProvider');

const providerOptions = {
    secret: cloudUtil.createBufferFrom('password12345').toString('base64')
};

let testProvider;

// Our tests cause too many event listeners. Turn off the check.
process.setMaxListeners(0);

module.exports = {
    setUp(callback) {
        testProvider = new ConsulCloudProvider();
        callback();
    },

    tearDown(callback) {
        Object.keys(require.cache).forEach((key) => {
            delete require.cache[key];
        });

        callback();
    },

    testLogger(test) {
        const logger = {
            a: 1,
            b: 2
        };
        test.expect(1);
        testProvider = new ConsulCloudProvider({ logger });
        test.deepEqual(testProvider.logger, logger);
        test.done();
    },

    testInit: {
        testInitSuccess(test) {
            test.expect(1);
            testProvider.init()
                .then(() => {
                    test.ok(true);
                    test.done();
                });
        },

        testProviderOptions(test) {
            test.expect(2);
            testProvider.init(providerOptions)
                .then(() => {
                    test.deepEqual(testProvider.providerOptions, providerOptions);
                    test.strictEqual(testProvider.token, 'password12345');
                    test.done();
                });
        }
    },

    testGetNodesFromUri: {
        setUp(callback) {
            testProvider = new ConsulCloudProvider();
            testProvider.init(providerOptions)
                .then(callback);
        },

        testSecret(test) {
            test.expect(2);
            testProvider.nodeProvider.getNodesFromUri = function getNodesFromUri(uri, options) {
                test.strictEqual(uri, 'https://example.com');
                test.deepEqual(options, {
                    headers: {
                        'X-Consul-Token': 'password12345'
                    }
                });
                test.done();
            };
            testProvider.getNodesFromUri('https://example.com');
        },

        testCustomHeaders(test) {
            test.expect(2);
            testProvider.nodeProvider.getNodesFromUri = function getNodesFromUri(uri, options) {
                test.strictEqual(uri, 'https://example.com');
                test.deepEqual(options, {
                    headers: {
                        'X-Consul-Token': 'password12345',
                        Foo: 'Bar',
                        Hello: 'World'
                    }
                });
                test.done();
            };
            testProvider.getNodesFromUri('https://example.com', {
                headers: {
                    Foo: 'Bar',
                    Hello: 'World'
                }
            });
        },

        testIdProcessing(test) {
            test.expect(1);
            testProvider.nodeProvider.getNodesFromUri = function getNodesFromUri() {
                return q([
                    {
                        id: {
                            ID: '',
                            Node: 'test-node-1'
                        },
                        ip: {
                            public: '192.0.2.47',
                            private: '192.0.2.17'
                        }
                    },
                    {
                        id: {
                            ID: 'c17d2be5-200a-4ff1-ab92-996f120f88cc',
                            Node: 'test-node-2'
                        },
                        ip: {
                            public: '192.0.2.48',
                            private: '192.0.2.18'
                        }
                    }
                ]);
            };
            testProvider.getNodesFromUri('https://example.com')
                .then((processedData) => {
                    test.deepEqual(processedData, [
                        {
                            id: 'test-node-1',
                            ip: {
                                public: '192.0.2.47',
                                private: '192.0.2.17'
                            }
                        },
                        {
                            id: 'c17d2be5-200a-4ff1-ab92-996f120f88cc',
                            ip: {
                                public: '192.0.2.48',
                                private: '192.0.2.18'
                            }
                        }
                    ]);
                    test.done();
                });
        }
    }
};
