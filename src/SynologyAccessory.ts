import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
} from 'homebridge';
import PollingService from './PollingService';
import syno from 'syno';
import wol from 'wol';

interface RawQueryParams {
  sessionName: string;
  api: string;
  method: string;
  version: string;
  path: string;
}

interface DiskInfo {
  temp: number;
}

interface SynoConfig {
  ignoreCertificateErrors: boolean;
  host: string;
  port: string|number;
  account: string;
  passwd: string;
  protocol: string;
  apiVersion: string;
  otp: undefined|string;
}

enum deviceStatus {
  Online = 'Online',
  Offline = 'Offline',
  WakingUp = 'WakingUp',
  ShuttingDown = 'ShuttingDown',
}

let hap: HAP;

export = (api: API) => {
  hap = api.hap;
  api.registerAccessory('synology', SynologyAccessory);
};

class SynologyAccessory implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly api: API;
  private readonly name: string;
  private readonly mac: string;
  private readonly shutdownTime: number;
  private readonly startupTime: number;
  private readonly disabled: Array<string>;
  private readonly config: SynoConfig;
  private dsm?: typeof syno;
  private readonly informationService: Service;
  private readonly switchService?: Service;
  private readonly temperatureService?: Service;
  private readonly diskTemperatureService?: Service;
  private state: deviceStatus;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.api = api;
    this.name = config.name;
    this.mac = config.mac;
    this.shutdownTime = config.shutdownTime || 60;
    this.startupTime = config.startupTime || 60;
    this.disabled = config.disabled || [];
    this.state = deviceStatus.Offline;
    this.config = {
      ignoreCertificateErrors: true,
      host: config.host,
      port: config.port || '5000',
      account: config.username,
      passwd: config.password,
      protocol: config.protocol,
      apiVersion: config.version || '6.2.2',
      otp: config.otp || undefined,
    };

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Synology')
      .setCharacteristic(hap.Characteristic.Model, config.model || 'Diskstation')
      .setCharacteristic(hap.Characteristic.FirmwareRevision, config.version || '6.2.2')
      .setCharacteristic(hap.Characteristic.SerialNumber, config.serial || 'n/a');

    this.switchService = new hap.Service.Switch(this.name);
    this.switchService.getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.SET, this.setState.bind(this));
    this.startStatePolling();

    if (!this.disabled.includes('temperature')) {
      this.temperatureService = new hap.Service.TemperatureSensor(`${this.name} Temperature`, 'systemp');
      this.startTemperaturePolling();
    }

    if (!this.disabled.includes('diskTemperature')) {
      this.diskTemperatureService = new hap.Service.TemperatureSensor(`${this.name} Average Disk Temperature`, 'disktemp');
      this.startDiskTemperaturePolling();
    }

    this.log.info(`Synology ${this.name} finished initializing!`);
  }

  startStatePolling(): void {
    const pollStateService = new PollingService(async () => {
      const adapter = await import(`node:${this.config.protocol}`);
      const options = {
        method: 'HEAD',
        host: this.config.host,
        port: this.config.port,
        rejectUnauthorized: false,
      };

      const req = adapter.request(options, (res) => {
        pollStateService.emit('state', res.statusCode === 200);
      });

      req.on('error', (e) => {
        this.log.debug(`can't reach ${this.name}: ${e}`);
        pollStateService.emit('state', false);
      });
      req.end();
    }, 5000);

    pollStateService.on('state', (state: boolean) => {
      if ((this.state === deviceStatus.Online && state)
        || (this.state === deviceStatus.Offline && !state)
        || (this.state === deviceStatus.WakingUp && !state)
        || (this.state === deviceStatus.ShuttingDown && state)
      ) {
        return;
      }

      this.switchService!.updateCharacteristic(hap.Characteristic.On, state);
      this.state = state ? deviceStatus.Online : deviceStatus.Offline;
      this.log.info(`state changed to ${this.state}; updated characteristic`);
    });
    pollStateService.start();

    this.api.on('shutdown', (): void => pollStateService.stop());
  }

  startTemperaturePolling(): void {
    const pollTemperatureService = new PollingService(async () => {
      // don't poll temperature if device is not online
      if (this.state !== deviceStatus.Online) {
        this.temperatureService!.updateCharacteristic(hap.Characteristic.StatusActive, false);
        this.log.debug('Device is not online; Polling temperature disabled.');
        return;
      }

      try {
        const res = await this.query('dsm', 'getInfo');
        pollTemperatureService.emit('change', res.temperature);
      } catch (err) {
        this.temperatureService!.updateCharacteristic(hap.Characteristic.StatusActive, false);
        this.log.warn(`Can't get temperature, ${err}`);
      }
    }, 30000);

    pollTemperatureService.on('change', (temperature: number) => {
      this.log.debug(`updating temperature to ${temperature} °C`);
      this.temperatureService!.updateCharacteristic(hap.Characteristic.CurrentTemperature, temperature);
      this.temperatureService!.updateCharacteristic(hap.Characteristic.StatusActive, true);
    });

    pollTemperatureService.start();
    this.api.on('shutdown', (): void => pollTemperatureService.stop());
  }

  startDiskTemperaturePolling(): void {
    const pollDiskTemperatureService = new PollingService(async () => {
      // don't poll disk temperature if device is not online
      if (this.state !== deviceStatus.Online) {
        this.diskTemperatureService!.updateCharacteristic(hap.Characteristic.StatusActive, false);
        this.log.debug('Device is not online; Polling disk temperature disabled.');
        return;
      }

      try {
        const res = await this.rawQuery({
          sessionName: 'StorageInfo',
          api: 'SYNO.Storage.CGI.Storage',
          version: '1',
          path: 'entry.cgi',
          method: 'load_info',
        });
        const avgDiskTemp = (res.disks as DiskInfo[])
          .map((d: DiskInfo) => d.temp)
          .reduce((a: number, b: number) => a + b) / (res.disks as DiskInfo[]).length;
        pollDiskTemperatureService.emit('change', Math.round(avgDiskTemp * 10) / 10);
      } catch (err) {
        this.diskTemperatureService!.updateCharacteristic(hap.Characteristic.StatusActive, false);
        this.log.warn(`Can't get average disk temperature, ${err}`);
      }
    }, 30000);

    pollDiskTemperatureService.on('change', (temperature: number) => {
      this.log.debug(`updating average disk temperature to ${temperature} °C`);
      this.diskTemperatureService!.updateCharacteristic(hap.Characteristic.CurrentTemperature, temperature);
      this.diskTemperatureService!.updateCharacteristic(hap.Characteristic.StatusActive, true);
    });

    pollDiskTemperatureService.start();
    this.api.on('shutdown', (): void => pollDiskTemperatureService.stop());
  }

  async setState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // no change if device is waking up or shutting down
    if (this.state === deviceStatus.WakingUp || this.state === deviceStatus.ShuttingDown) {
      return callback();
    }

    // return if states matches
    if (this.state === deviceStatus.Online && value as boolean) {
      return callback();
    }

    if (value as boolean) {
      this.log.debug(`wake up ${this.name}.`);
      wol.wake(this.mac, (err) => {
        if (err) {
          this.log.warn(`Could not wake up ${this.name}: ${err}`);
          this.state = deviceStatus.Offline;
          return;
        }
        this.log.info(`${this.name} woke up!`);
        this.state = deviceStatus.WakingUp;
        setTimeout(() => {
          if (this.state !== deviceStatus.WakingUp) {
            return;
          }

          this.log.error(`Startup time of ${this.startupTime}s expired, reverting state to offline`);
          this.state = deviceStatus.Offline;
        }, this.startupTime * 1000);
      });
      callback();
    } else {
      try {
        this.log.info(`Shutting down ${this.name}`);
        await this.query('dsm', 'shutdownSystem');
        this.state = deviceStatus.ShuttingDown;
        this.dsm = undefined;
        setTimeout(() => {
          if (this.state !== deviceStatus.ShuttingDown) {
            return;
          }

          this.log.error(`Shutdown time of ${this.shutdownTime}s expired, reverting state to online`);
          this.state = deviceStatus.Online;
        }, this.shutdownTime * 1000);
      } catch(err) {
        this.log.error(`Can't shutdown ${this.name}: ${err}`);
        this.state = deviceStatus.Online;
      }
      callback();
    }
  }

  query(api: string, method: string, params:Record<string, unknown> = {}) {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      if (this.state !== deviceStatus.Online) {
        return reject(new Error(`${this.name} is offline, waking up or shutting down. No query possible`));
      }

      if (!this.dsm) {
        this.dsm = new syno(this.config);
      }

      this.dsm[api][method](params, (err: Record<string, unknown>, data: Record<string, unknown>) => {
        if (err) {
          return reject(err);
        }
        resolve(data);
      });
    });
  }

  rawQuery(params: RawQueryParams) {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      if (this.state !== deviceStatus.Online) {
        return reject(new Error(`${this.name} is offline, waking up or shutting down. No query possible`));
      }

      if (!this.dsm) {
        this.dsm = new syno(this.config);
      }

      this.dsm.dsm.requestAPI({
        params: null,
        done(err: Record<string, unknown>, data: Record<string, unknown>) {
          if (err) {
            return reject(err);
          }
          resolve(data);
        },
        apiInfos: params,
      });
    });
  }

  identify(): void {
    this.log(`Identifying Synology ${this.name}`);
  }

  getServices(): Service[] {
    const services: Service[] = [this.informationService];

    if (!this.disabled.includes('switch') && this.switchService) {
      services.push(this.switchService);
    }
    if (!this.disabled.includes('temperature') && this.temperatureService) {
      services.push(this.temperatureService);
    }
    if (!this.disabled.includes('diskTemperature') && this.diskTemperatureService) {
      services.push(this.diskTemperatureService);
    }

    return services;
  }
}
