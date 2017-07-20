var Service, Characteristic;
var Synology = require('./lib/synology');
var inherits = require('util').inherits;
var pollingtoevent = require('polling-to-event');
var ssl = require('ssl-root-cas').inject();


module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    fixInheritance(SynologyAccessory.CpuLoad, Characteristic);
    fixInheritance(SynologyAccessory.DiskUsage, Characteristic);
    fixInheritance(SynologyAccessory.StatsService, Service);

    homebridge.registerAccessory('homebridge-synology', 'Synology', SynologyAccessory);
};


function fixInheritance(subclass, superclass) {
    var proto = subclass.prototype;
    inherits(subclass, superclass);
    subclass.prototype.parent = superclass.prototype;
    for (var mn in proto) {
        subclass.prototype[mn] = proto[mn];
    }
}


function SynologyAccessory(log, config) {
    this.log = log;
    this.config = config;
    this.name = config.name;

    this.log('Diskstation url: http' + config.secure ? 's' : '' + '://' + config.ip + ':' + config.port);

    this.synology = new Synology({
      ip: config.ip,
      mac: config.mac,
      secure: config.secure || null,
      port: config.port || null,
      version: config.version,
      user: config.user || config.account,
      passwd: config.password,
      timeout: config.timeout || 3000
    });

    var that = this;

    this.doPolling = config.doPolling || false;
	this.pollingInterval = config.pollingInterval || 60;
	this.pollingInterval = parseInt(this.pollingInterval);

	this.setAttempt = 0;
	this.state = false;

	if (this.interval < 10 && this.interval > 100000) {
		this.log('polling interval out of range... disabled polling');
		this.doPolling = false;
	}

	// Status Polling
	if (this.doPolling) {
		that.log('start polling...');
		var statusemitter = pollingtoevent(function(done) {
			that.log('do poll...')
			that.getPowerState(function(error, state) {
				done(error, state, that.setAttempt);
			}, 'statuspoll');
		},{
		    longpolling: true,
		    interval: that.pollingInterval * 1000,
		    longpollEventName:'statuspoll'
		});

		statusemitter.on('statuspoll', function(data) {
			that.state = data;
			that.log('poll end, state: ' + data);

			if (that.switchService ) {
			    that.switchService.getCharacteristic(Characteristic.On)
    			.updateValue(that.state, null, 'statuspoll');
			}
		});
	}

}


SynologyAccessory.CpuLoad = function () {
    Characteristic.call(this, 'CPU Load', '12d21a89-9466-4548-8edd-b05e6b93c23e');
    this.setProps({
        format: Characteristic.Formats.UINT8,
        unit: Characteristic.Units.PERCENTAGE,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
    });
    this.value = this.getDefaultValue();
};


SynologyAccessory.DiskUsage = function () {
    Characteristic.call(this, 'Disk Usage', 'de3c3d3d-6f86-446c-9dac-535858736ddd');
    this.setProps({
        format: Characteristic.Formats.UINT8,
        unit: Characteristic.Units.PERCENTAGE,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
    });
    this.value = this.getDefaultValue();
};


SynologyAccessory.StatsService = function (displayName, subtype) {
    Service.call(this, displayName, '9d0ea4eb-31db-47e9-83ef-302193e669d8', subtype);
    this.addCharacteristic(new SynologyAccessory.DiskUsage());
    this.addCharacteristic(new SynologyAccessory.CpuLoad());
};


SynologyAccessory.prototype.getPowerState = function (callback, context) {
    var that = this;

    if ((!context || context != 'statuspoll') && this.doPolling) {
		callback(null, this.state);
	} else {
        that.synology.getPowerState(function (err, state) {
            if (!err) {
                that.log('current power state is: ' + state);
                callback(null, state);
            } else {
                that.log(err);
                callback(err);
            }
        });
    }
};


SynologyAccessory.prototype.setPowerState = function (powerState, callback, context) {
    var that = this;

    //don't set the value while polling
	if (context && context === 'statuspoll') {
		callback(null, powerState);
	    return;
	}

    this.setAttempt++;

    if (powerState) { //turn on
        that.synology.wakeUp(function (err) {
            if (!err) {
                that.log('Diskstation woked up!');
                callback(null);
            } else {
                that.log('Something went wrong: ' + err);
                callback(err);
            }
        });
    }

    else { //turn off
        that.synology.shutdown(function (err) {
            if (!err) {
                that.log('Shutting down Diskstation')
                callback(null);
            } else {
                that.log('Error shutting down Diskstation: ' + err)
                callback(err);
            }
        });
    }
};


SynologyAccessory.prototype.getCpuLoad = function (callback) {
    var that = this;

    if(!that.state) {
        callback(null, 0)
        return;
    }

    that.synology.getCpuLoad(function (err, data) {
        if (!err) {
            that.log('current cpu load: %s %', data);
            callback(null, data);
        } else {
            that.log(err);
            callback(null, 0); //testing
        }
    });
};


SynologyAccessory.prototype.getDiskUsage = function (callback) {
    var that = this;

    if(!that.state) {
        callback(null, 0)
        return;
    }

    that.synology.getDiskUsage(function (err, data) {
        if (!err) {
            that.log('current volume usage: %s %', data);
            callback(null, data);
        } else {
            that.log(err);
            callback(null, 0); //testing
        }
    });
};


SynologyAccessory.prototype.getSystemTemp = function (callback) {
    var that = this;

    if(!that.state) {
        callback(null, 0)
        return;
    }

    that.synology.getSystemTemp(function (err, data) {
        if (!err) {
            that.log('current system temp: %s °C', data);
            callback(null, data);
        } else {
            that.log(err);
            callback(null, 0); //testing
        }
    });
};


SynologyAccessory.prototype.getServices = function () {
    var informationService = new Service.AccessoryInformation();

    informationService
        .setCharacteristic(Characteristic.Name, this.name)
        .setCharacteristic(Characteristic.Manufacturer, 'Synology');

    this.switchService = new Service.Switch(this.name);
    this.switchService.getCharacteristic(Characteristic.On)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this));

    var statsService = new SynologyAccessory.StatsService(this.name + 'status');
    statsService.getCharacteristic(SynologyAccessory.DiskUsage)
        .on('get', this.getDiskUsage.bind(this));
    statsService.getCharacteristic(SynologyAccessory.CpuLoad)
        .on('get', this.getCpuLoad.bind(this));

    var tempService = new Service.TemperatureSensor(this.name + ' temperature');
    tempService.getCharacteristic(Characteristic.CurrentTemperature)
        .on('get', this.getSystemTemp.bind(this));

    var services = [informationService];

    if ('disabled' in this.config) {
        if (this.config.disabled.indexOf("switch") === -1) { services.push(this.switchService); }
        if (this.config.disabled.indexOf("stats") === -1) { services.push(statsService); }
        if (this.config.disabled.indexOf("temp") === -1) { services.push(tempService); }
    } else {
        var services = [informationService, this.switchService, tempService, statsService];
    }

    return services;
};
