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
    this.timeout = params.timeout || 5000; //request timeout
    this.version = parseInt(params.version) ||  6;
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
 * Log into your diskstation and return the session id
 * @param account Account Name
 * @param passwd Password for your account
 * @param callback (error)
 */
Synology.prototype.login = function(account, passwd, callback) {
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

        request({
            url: this.url + '/webapi/auth.cgi',
            qs: params,
            timeout: this.timeout
        }, function(err, res, body) {
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
 * get the power State of your Diskstation
 * @param callback
 */
Synology.prototype.getPowerState = function(callback) {
    request({
        url: this.url + '/webman/index.cgi',
        method: 'GET',
        timeout: this.timeout
    }, function(err, res) {
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
Synology.prototype.wakeUp = function(callback) {
    wol.wake(this.mac, function(err) {
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
Synology.prototype.shutdown = function(callback) {
    var params = {
        api: (this.version >= 6) ? 'SYNO.Core.System' : 'SYNO.DSM.System',
        version: 1,
        method: 'shutdown',
        _sid: this.auth.sid
    };

    var apiUrl = (this.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/system.cgi';

    request({
        url: this.url + apiUrl,
        qs: params,
        method: 'GET'
    }, function(err, res, body) {
        (!err && res.statusCode == 200 && JSON.parse(body).success) ? callback(null): callback(err);
    }.bind(this));
};

/**
 * gets the average disk temperature
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Synology.prototype.getDiskTemp = function(callback) {
    var params = {
        api: (this.version >= 6) ? 'SYNO.Core.System' : '',
        version: 1,
        method: (this.version >= 6) ? 'info' : 'getinfo',
        type: 'storage',
        _sid: this.auth.sid
    };

    var apiUrl = (this.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/info.cgi';

    request({
        url: this.url + apiUrl,
        qs: params,
        method: 'GET'
    }, function(err, res, body) {
        if (!err && res.statusCode == 200) {
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
    }.bind(this));

}


/**
 * System temperature of your diskstation
 * If not available, it returns your average disk temperature
 * @param callback
 */
Synology.prototype.getSystemTemp = function(callback) {

    var params = {
        api: (this.version >= 6) ? 'SYNO.Core.System' : 'SYNO.DSM.Info',
        version: 1,
        method: (this.version >= 6) ? 'info' : 'getinfo',
        _sid: this.auth.sid
    };

    var apiUrl = (this.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/info.cgi';

    request({
        url: this.url + apiUrl,
        qs: params,
        method: 'GET'
    }, function(err, res, body) {
        if (!err && res.statusCode == 200) {
            var json = JSON.parse(body);
            if (json.success && typeof json.data.temperature !== 'undefined') {
                callback(null, json.data.temperature);
            } else {
                this.getDiskTemp(function(error, data) {
                    (!error) ? callback(null, data): callback(error)
                });
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
Synology.prototype.getCpuLoad = function(callback) {
    var params = {
        api: (this.version >= 6) ? 'SYNO.Core.System.Utilization' : 'SYNO.DSM.SystemLoading',
        version: 1,
        method: (this.version >= 6) ? 'get' : 'getinfo',
        type: 'current',
        resource: ['cpu'],
        _sid: this.auth.sid
    };

    var apiUrl = (this.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/system_loading.cgi';

    request({
        url: this.url + apiUrl,
        qs: params,
        method: 'GET'
    }, function(err, res, body) {
        if (!err && res.statusCode == 200) {
            var json = JSON.parse(body);
            if (json.success) {
                if (this.version >= 6) {
                    var load = json.data.cpu['other_load'] +
                        json.data.cpu['system_load'] +
                        json.data.cpu['user_load'];
                } else {
                    load = Math.round(json.data.cpu.user * 100);
                }
                callback(null, load);
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
Synology.prototype.getDiskUsage = function(callback) {

    var params = {
        api: (this.version >= 6) ? 'SYNO.Core.System' : 'SYNO.DSM.Volume',
        version: 1,
        method: (this.version >= 6) ? 'info' : 'list',
        type: 'storage', //only dsm >= 6
        _sid: this.auth.sid
    };

    var apiUrl = (this.version >= 6) ? '/webapi/entry.cgi' : '/webapi/dsm/volume.cgi';

    request({
        url: this.url + apiUrl,
        qs: params,
        method: 'GET'
    }, function(err, res, body) {
        if (!err && res.statusCode == 200) {
            var json = JSON.parse(body);

            //dsm version 5.x
            if (json.success && this.version < 6) {
                var used = 0,
                    total = 0;
                for (var i = json.data.volumes.length; i--;) {
                    used += json.data.volumes[i].used;
                    total += json.data.volumes[i].total;
                }
                callback(null, Math.round(used / total * 100));

                //dsm version 6.x
            } else if (json.success && this.version >= 6) {
                var used = 0,
                    total = 0;
                for (var i = json.data.vol_info.length; i--;) {
                    used += json.data.vol_info[i].used_size;
                    total += json.data.vol_info[i].total_size;
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
