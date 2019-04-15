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
const fs = require('fs');

const cloudUtil = require('@f5devcentral/f5-cloud-libs').util;
const ConsulCloudProvider = require('../../lib/consulCloudProvider');

const origRunShellCommand = cloudUtil.runShellCommand;
const origReadFile = fs.readFile;

const caBundle = '/foo/bar/myCert.pem';
const providerOptions = {
    secret: cloudUtil.createBufferFrom('password12345').toString('base64'),
    caBundle,
    rejectUnauthorized: false
};
const responseCertDir = ':foo:bar:myCert.pem_27774_1\n:foo:bar:myCert.pem_26654_1\n:foo:myCert.pem_16654_1';

let testProvider;

function mockRunShellCommand(response) {
    cloudUtil.runShellCommand = function runShellCommand() {
        return response;
    };
}

function mockReadFile(response) {
    fs.readFile = function readFile(path, callback) {
        callback(null, response);
    };
}

// Our tests cause too many event listeners. Turn off the check.
process.setMaxListeners(0);

module.exports = {
    setUp(callback) {
        mockRunShellCommand(q(responseCertDir));
        mockReadFile(Buffer.from('foo bar'));
        testProvider = new ConsulCloudProvider();
        callback();
    },

    tearDown(callback) {
        cloudUtil.runShellCommand = origRunShellCommand;
        fs.readFile = origReadFile;
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
            test.expect(2);
            testProvider.init()
                .then(() => {
                    test.strictEqual(testProvider.rejectUnauthorized, true);
                    test.ok(true);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testProviderOptions(test) {
            test.expect(4);
            testProvider.init(providerOptions)
                .then(() => {
                    test.deepEqual(testProvider.providerOptions, providerOptions);
                    test.strictEqual(testProvider.token, 'password12345');
                    test.strictEqual(
                        testProvider.caBundleTmshPath,
                        testProvider.providerOptions.caBundle
                    );
                    test.strictEqual(testProvider.rejectUnauthorized, false);
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        },

        testBadCaCertPath(test) {
            mockRunShellCommand(q.reject(new Error('Error: Command failed: ls -1t '
                + '/config/filestore/files_d/foo_d/certificate_d/\nls: cannot access '
                + '\'/config/filestore/files_d/foo_d/certificate_d/\': No such file or directory')));

            test.expect(1);
            testProvider.init(providerOptions)
                .then(() => {
                    test.ok(false, 'should have thrown "Command failed" error');
                })
                .catch((err) => {
                    test.notStrictEqual(err.message.indexOf('Command failed: ls -1t'), -1);
                })
                .finally(() => {
                    test.done();
                });
        },

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
                    },
                    ca: Buffer.from('foo bar'),
                    rejectUnauthorized: false
                });
                return q([]);
            };
            testProvider.getNodesFromUri('https://example.com')
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
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
                    },
                    ca: Buffer.from('foo bar'),
                    rejectUnauthorized: false
                });
                return q([]);
            };
            testProvider.getNodesFromUri('https://example.com', {
                headers: {
                    Foo: 'Bar',
                    Hello: 'World'
                }
            })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
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
                })
                .catch((err) => {
                    test.ok(false, err);
                })
                .finally(() => {
                    test.done();
                });
        }
    }
};
