/**
 * synology.js functions for homebridge
 * 12.03.2016 by stfnhmplr
 */

var request = require('request');
var wol = require('wake_on_lan');

var Synology = function(params) {
    this.ip = params.ip;
    this.mac = params.mac;
    this.secure = params.secure || false;
    this.port = params.port || (this.secure ? 5001 : 5000);
    this.timeout = parseInt(params.timeout) || 5000; //request timeout
    this.version = parseInt(params.version) ||  6;

    this.user = params.user;
    this.passwd = params.passwd;
    this.auth = {
        sid: '', //session id
        time: '', //unix time
        timeout: 15 * 60 //in sec
    };

    this.url = 'http' + (this.secure ? 's' : '') + '://' + this.ip + ':' + this.port;
};


/**
 * check if the sid is still valid
 * @returns {string|boolean}
 */
Synology.prototype.isLoggedIn = function() {
    return (this.auth.sid && (this.auth.time + this.auth.timeout) > (new Date / 1e3 | 0)) ? true : false;
};


/**
 * Login to your diskstation
 * @return {Promise}
 */
Synology.prototype._login = function() {
    var that = this;

    return new Promise(function(resolve, reject) {
        if(that.isLoggedIn()) {
            resolve("Still logged in")
        } else {
            var options = {
                url: that.url + '/webapi/auth.cgi',
                timeout: that.timeout,
                qs: {
                    api: 'SYNO.API.Auth',
                    method: 'login',
                    version: 3,
                    account: that.user,
                    passwd: that.passwd,
                    session: 'homebridge-synology-' + Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10),
                    format: 'sid'
                }
            };

            request.get(options, function(err, res, body) {
                if(!err && res.statusCode === 200) {
                    var json = JSON.parse(body);
                    if ('error' in json) {
                        reject("Can't login to Diskstation. Error Code: " + json.error.code)
                    } else {
                        that.auth.sid = json.data.sid;
                        that.auth.time = (new Date / 1e3 | 0);
                        resolve('Login successfull');
                    }
                } else {
                    reject("Can't login to Diskstation. " + err.message)
                }
            });
        }
    });
};


/**
 * get the power State of your Diskstation
 * @param callback
 */
Synology.prototype.getPowerState = function(callback) {
    that = this;

    var options = {
        url: that.url + '/webman/index.cgi',
        method: 'GET',
        timeout: that.timeout
    }

    request(options, function(err, res) {
        if (!err && res.statusCode === 200) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    });
};


/**
 * Wake on LAN support for Diskstation
 * wol has to be enabled
 * @param callback
 */
Synology.prototype.wakeUp = function(callback) {
    var that = this;

    wol.wake(that.mac, function(err) {
        if (!err) {
            callback(null)
        } else {
            callback(err);
        }
    });
};


/**
 * Shutdown your Diskstation
 * @param callback
 */
Synology.prototype.shutdown = function(callback) {
    var that = this;

    that._login().then(function() {
        var apiUrl = (that.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/system.cgi';

        var options = {
            url: that.url + apiUrl,
            qs: {
                api: (that.version >= 6) ? 'SYNO.Core.System' : 'SYNO.DSM.System',
                version: 1,
                method: 'shutdown',
                _sid: that.auth.sid
            },
            method: 'GET',
        };

        request(options, function(err, res, body) {
            (!err && res.statusCode === 200 && JSON.parse(body).success) ? callback(null): callback(err);
        });
    }).catch(function(err) {
        callback(err);
    });

};


/**
 * gets the average disk temperature
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Synology.prototype.getDiskTemp = function(callback) {
    var that = this;

    that._login().then(function(res) {
        var apiUrl = (that.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/info.cgi';
        var options = {
            url: that.url + apiUrl,
            qs: {
                api: (that.version >= 6) ? 'SYNO.Core.System' : '',
                version: 1,
                method: (that.version >= 6) ? 'info' : 'getinfo',
                type: 'storage',
                _sid: that.auth.sid
            },
            method: 'GET'
        };

        request(options, function(err, res, body) {
            if (!err && res.statusCode === 200) {
                var json = JSON.parse(body);
                if (json.success) {
                    var temp = 0;
                    for (var i = json.data.hdd_info.length; i--;) {
                        temp += json.data.hdd_info[i].temp;
                    }
                    temp = Math.round(temp / json.data.hdd_info.length);
                    callback(null, temp);
                } else {
                    callback(err);
                }
            } else {
                callback(err);
            }
        });
    }).catch(function(err) {
        callback(err);
    });
}


/**
 * System temperature of your diskstation
 * If not available, it returns your average disk temperature
 * @param callback
 */
Synology.prototype.getSystemTemp = function(callback) {
    var that = this;

    that._login().then(function() {
        var apiUrl = (that.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/info.cgi';
        var options = {
            url: that.url + apiUrl,
            qs: {
                api: (that.version >= 6) ? 'SYNO.Core.System' : 'SYNO.DSM.Info',
                version: 1,
                method: (that.version >= 6) ? 'info' : 'getinfo',
                _sid: that.auth.sid
            },
            method: 'GET'
        };
        request(options, function(err, res, body) {
            if (!err && res.statusCode == 200) {
                var json = JSON.parse(body);
                if (json.success && typeof json.data.temperature !== 'undefined') {
                    callback(null, json.data.temperature);
                } else {
                    that.getDiskTemp(function(error, data) {
                        if(!error) {
                            callback(null, data)
                        } else {
                            callback("An error occured while getting SystemTemp: " + error)
                        }
                    });
                }
            } else {
                callback("An error occured while getting SystemTemp: " + err);
            }
        });
    }).catch(function(err) {
        callback("An error occured while getting SystemTemp: " + err);
    });
};


/**
 * returns the current cpu load
 * @param callback
 */
Synology.prototype.getCpuLoad = function(callback) {
    var that = this;

    that._login().then(function() {

        var apiUrl = (that.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/system_loading.cgi';
        var options = {
            url: that.url + apiUrl,
            qs: {
                api: (that.version >= 6) ? 'SYNO.Core.System.Utilization' : 'SYNO.DSM.SystemLoading',
                version: 1,
                method: (that.version >= 6) ? 'get' : 'getinfo',
                type: 'current',
                resource: ['cpu'],
                _sid: that.auth.sid
            },
            method: 'GET'
        };

        request(options, function(err, res, body) {
            if (!err && res.statusCode == 200) {
                var json = JSON.parse(body);
                if (json.success) {
                    if (that.version >= 6) {
                        var load = json.data.cpu['other_load'] +
                            json.data.cpu['system_load'] +
                            json.data.cpu['user_load'];
                    } else {
                        load = Math.round(json.data.cpu.user * 100);
                    }
                    callback(null, load);
                } else {
                    callback("An error occured while getting CpuLoad: " + json.error.code);
                }
            } else {
                callback("An error occured while getting CpuLoad: " + err);
            }
        });
    }).catch(function(err) {
        callback("An error occured while getting CpuLoad: " + err);
    })
};


/**
 * Gets the current disk/volume usage quote
 * returns the average if there are more than one volume
 * @param callback
 */
Synology.prototype.getDiskUsage = function(callback) {
    var that = this;

    that._login().then(function() {
        var apiUrl = (that.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/volume.cgi';
        var options = {
            url: that.url + apiUrl,
            qs: {
                api: (that.version >= 6) ? 'SYNO.Core.System' : 'SYNO.DSM.Volume',
                version: 1,
                method: (that.version >= 6) ? 'info' : 'list',
                type: 'storage', //only dsm >= 6
                _sid: that.auth.sid
            },
            method: 'GET'
        };

        request(options, function(err, res, body) {
            if (!err && res.statusCode == 200) {
                var json = JSON.parse(body);

                //dsm version 5.x
                if (json.success && that.version < 6) {
                    var used = 0,
                        total = 0;
                    for (var i = json.data.volumes.length; i--;) {
                        used += json.data.volumes[i].used;
                        total += json.data.volumes[i].total;
                    }
                    callback(null, Math.round(used / total * 100));

                    //dsm version 6.x
                } else if (json.success && that.version >= 6) {
                    var used = 0,
                        total = 0;
                    for (var i = json.data.vol_info.length; i--;) {
                        used += json.data.vol_info[i].used_size;
                        total += json.data.vol_info[i].total_size;
                    }
                    callback(null, Math.round(used / total * 100));

                } else {
                    callback("An error occured while getting DiskUsage: " + json.error.code);
                }
            } else {
                callback("An error occured while getting DiskUsage: " + err);
            }
        });
    }).catch(function(err) {
        callback(err);
    });
};

module.exports = Synology;
