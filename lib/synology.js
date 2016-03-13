/**
 * synology.js functions for homebridge
 * 12.03.2016 by stfnhmplr
 */


var request = require('request');
var wol = require('wake_on_lan');

var Synology = function (ip, mac, secure, port, timeout) {
    this.ip = ip;
    this.mac = mac;
    this.secure = secure;
    this.port = port || (this.secure ? 5001 : 5000);
    this.timeout = timeout || 3000; //request timeout
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
Synology.prototype.isLoggedIn = function () {
    return (this.auth.sid && (this.auth.time + this.auth.timeout) > (new Date / 1e3 | 0)) ? true : false;
};


/**
 * Log into your diskstation and return the session id
 * @param account Account Name
 * @param passwd Password for your account
 * @param callback (error)
 */
Synology.prototype.login = function (account, passwd, callback) {
    if (!this.isLoggedIn()) {
        var params = {
            api: 'SYNO.API.Auth',
            method: 'login',
            version: 3,
            account: account,
            passwd: passwd,
            session: 'homebridge-synology-' + Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10),
            format: 'sid'
        };

        request({url: this.url + '/webapi/auth.cgi', qs: params, timeout: this.timeout}, function (err, res, body) {
            if (!err) {
                var json = JSON.parse(body);
                if (json.success) {
                    this.auth.sid = json.data.sid;
                    this.auth.time = (new Date / 1e3 | 0);
                    callback(null);
                } else {
                    callback(err);
                }
            } else {
                callback(err);
            }
        }.bind(this));
    } else {
        callback(null);
    }
};


/**
 * User logout
 * @param callback
 */
Synology.prototype.logout = function (callback) {
    var params = {
        api: 'SYNO.API.Auth',
        method: 'login',
        version: 3,
        sid: this.auth.sid
    };

    request({url: this.url + '/webapi/auth.cgi', qs: params, timeout: this.timeout}, function (err, res, body) {
        if (!err) {
            var json = JSON.parse(body);
            if (json.success) {
                this.log('user logged out');
                callback(null, true); //return sid
            } else {
                this.log('something went wrong: ' + json.error.code);
                callback(json.error.code);
            }
        } else {
            this.log('something went wrong: ' + err);
            callback(err);
        }
    }.bind(this));
};


/**
 * get the power State of your Diskstation
 * @param callback
 */
Synology.prototype.getPowerState = function (callback) {
    request({url: this.url + '/webman/index.cgi', method: 'GET', timeout: this.timeout}, function (err, res) {
        if (!err && res.statusCode == 200) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    }.bind(this));
};


/**
 * Wake on LAN support for Diskstation
 * wol has to be enabled
 * @param callback
 */
Synology.prototype.wakeUp = function (callback) {
    wol.wake(this.mac, function (err) {
        if (!err) {
            callback(null)
        } else {
            callback(err);
        }
    }.bind(this));
};


/**
 * Shutdown your Diskstation
 * @param callback
 */
Synology.prototype.shutdown = function (callback) {
    var params = {
        api: 'SYNO.DSM.System',
        version: 1,
        method: 'shutdown',
        _sid: this.auth.sid
    };

    request({url: this.url + '/webapi/dsm/system.cgi', qs: params, method: 'GET'}, function (err, res, body) {
        (!err && res.statusCode == 200 && JSON.parse(body).success) ? callback(null) : callback(err);
    }.bind(this));
};


/**
 * System temperature of your diskstation
 * @param callback
 */
Synology.prototype.getSystemTemp = function (callback) {
    var params = {
        api: 'SYNO.DSM.Info',
        version: 1,
        method: 'getinfo',
        _sid: this.auth.sid
    };
    request({url: this.url + '/webapi/dsm/info.cgi', qs: params, method: 'GET'}, function (err, res, body) {
        if (!err && res.statusCode == 200) {
            var json = JSON.parse(body);
            if (json.success) {
                callback(null, json.data.temperature);
            } else {
                callback(err);
            }
        } else {
            callback(err);
        }
    }.bind(this));
};


/**
 * returns the current cpu load
 * @param callback
 */
Synology.prototype.getCpuLoad = function (callback) {
    var params = {
        api: 'SYNO.DSM.SystemLoading',
        version: 1,
        method: 'getinfo',
        _sid: this.auth.sid
    };
    request({url: this.url + '/webapi/dsm/system_loading.cgi', qs: params, method: 'GET'}, function (err, res, body) {
        if (!err && res.statusCode == 200) {
            var json = JSON.parse(body);
            if (json.success) {
                callback(null, Math.round(json.data.cpu.user * 100));
            } else {
                callback(err);
            }
        } else {
            callback(err);
        }
    }.bind(this));
};


/**
 * Gets the current disk/volume usage quote
 * returns the average if there are more than one volume
 * @param callback
 */
Synology.prototype.getDiskUsage = function (callback) {
    var params = {
        api: 'SYNO.DSM.Volume',
        version: 1,
        method: 'list',
        _sid: this.auth.sid
    };

    request({url: this.url + '/webapi/dsm/volume.cgi', qs: params, method: 'GET'}, function (err, res, body) {
        if (!err && res.statusCode == 200) {
            var json = JSON.parse(body);
            if (json.success) {
                var used = 0, total = 0;
                for (var i = json.data.volumes.length; i--;) {
                    used += json.data.volumes[i].used;
                    total += json.data.volumes[i].total;
                }
                callback(null, Math.round(used / total * 100));
            } else {
                callback(err);
            }
        } else {
            callback(err);
        }
    }.bind(this));
};

module.exports = Synology;