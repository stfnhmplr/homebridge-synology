import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service
} from 'homebridge';
import PollingService from './PollingService';
import ping from 'ping';
import syno from 'syno';
import wol from 'wol';

let hap: HAP;

export = (api: API) => {
  hap = api.hap;
  api.registerAccessory('synology', SynologyAccessory);
};

interface SystemInfo {
  codepage: string,
  model: string,
  ram: number,
  serial: string,
  temperature: number,
  time: string,
  uptime: number,
  version: string,
  version_string: string
}

class SynologyAccessory implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly api: API;
  private readonly name: string;
  private readonly host: string;
  private readonly mac: string;
  private readonly disabled: Array<String>;
  private readonly dsm: typeof syno;
  private state: boolean = false;
  private readonly informationService: Service;
  private readonly switchService: Service;
  private readonly temperatureService: Service;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.api = api;
    this.name = config.name;
    this.mac = config.mac;
    this.host = config.host;
    this.disabled = config.disabled || [];

    this.dsm = new syno({
      ignoreCertificateErrors: true,
      host: config.host,
      port: config.port || '5000',
      account: config.username,
      passwd: config.password,
      protocol: config.https ? 'https' : 'http',
      apiVersion: config.version || '6.2.2',
      otp: config.otp || false,
    });

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Synology')
      .setCharacteristic(hap.Characteristic.Model, config.model || 'Diskstation')
      .setCharacteristic(hap.Characteristic.FirmwareRevision, config.version || '6.2.2')
      .setCharacteristic(hap.Characteristic.SerialNumber, config.serial || 'n/a');

    this.switchService = new hap.Service.Switch(this.name);
    this.switchService.getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.SET, this.setState.bind(this));
    this.temperatureService = new hap.Service.TemperatureSensor(`${this.name} Temperature`);

    this.log.info(`Synology ${this.name} finished initializing!`);

    const pollStateService = new PollingService(async () => {
      const res = await ping.promise.probe(this.host);
      pollStateService.emit('state', res.alive);
    }, 5000);

    if (!this.disabled.includes('switch')) {
      pollStateService.on('state', (state: boolean) => {
        if (this.state === state) return;

        this.log.info(`state changed to ${state}; updating characteristic`);
        this.switchService.updateCharacteristic(hap.Characteristic.On, state);
        this.state = state;
      });
      pollStateService.start();
    }

    const pollTemperatureService = new PollingService(async () => {
      if (!this.state) {
        this.temperatureService.updateCharacteristic(hap.Characteristic.StatusActive, false);
        this.log.debug('Device is offline; Polling temperature disabled.');
        return;
      }

      try {
        const res: SystemInfo = await this.query('dsm', 'getInfo');
        pollTemperatureService.emit('change', res.temperature);
      } catch (e) {
        this.temperatureService.updateCharacteristic(hap.Characteristic.StatusActive, false);
        this.log.warn(`Can't get temperature, ${e}`);
      }
    }, 30000);

    if (!this.disabled.includes('temperature')) {
      pollTemperatureService.on('change', (temperature: number) => {
        this.log.debug(`updating temperature to ${temperature} °C`)
        this.temperatureService.updateCharacteristic(hap.Characteristic.CurrentTemperature, temperature);
        this.temperatureService.updateCharacteristic(hap.Characteristic.StatusActive, true);
      });
      pollTemperatureService.start();
    }

    this.api.on('shutdown', (): void => {
      pollStateService.stop();
      pollTemperatureService.stop();
    });
  }

  async setState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (this.state === value as boolean) return callback(null);

    if (value as boolean) {
      this.log.debug(`wake up ${this.name}.`)
      wol.wake(this.mac, (err) => {
        if (err) return callback(err);
        this.log.info(`${this.name} woke up!`);
        this.state = true;
        return callback();
      });
    }

    try {
      this.log.debug(`Shutting down ${this.name}`)
      await this.query('dsm','shutdownSystem');
      this.log.info(`${this.name} turned off.`);
      this.state = false;
    } catch(e) {
      this.log.error(`Can't shutdown ${this.name}: ${e}`);
      return callback(e);
    }

    callback(null);
  }

  query(api: string, method: string, params:object = {}): Promise<any> {
      return new Promise<any>((resolve, reject) => {
          this.dsm[api][method](params, (err: any, data: object) => {
              if (err) return reject(err);
              resolve(data);
          });
      });
  }

  identify(): void {
    this.log(`Identifying Synology ${this.name}`);
  }


  getServices(): Service[] {
    return [
      this.informationService,
      this.switchService,
      this.temperatureService,
    ];
  }
}
