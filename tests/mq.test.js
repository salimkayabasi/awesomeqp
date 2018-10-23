const amqp = require('amqplib');
const { EventEmitter } = require('events');
const request = require('request-promise-native');

const msInSec = 1000;
const delay = seconds => new Promise(resolve => setTimeout(resolve, (seconds * msInSec)));
const { AMQP_URL, AMQP_HTTP_TEST_URL } = process.env;

describe('MQ', () => {
  let mockAmqp;
  let mockOptions;
  let mq;
  let MQ;
  let onError;

  beforeAll(() => {
    jest.setTimeout(15 * msInSec);
  });

  beforeEach(() => {
    mockAmqp = {
      connect: jest.fn(),
    };
    mockOptions = {
      name: 'name',
      url: 'url',
      queueName: 'queueName',
      type: 'queue',
    };
    MQ = require.requireActual('../src/mq');
    mq = new MQ(mockAmqp, mockOptions);
    onError = jest.fn();
    mq.on('error', onError);
  });

  describe('constructor', () => {
    test('should throw if amqp is not passing as arguments', async () => {
      expect.assertions(1);
      try {
        mq = new MQ();
      } catch (e) {
        expect(e.message).toBe('amqp module is required');
      }
    });
    test('should throw if options is not passing as arguments', async () => {
      expect.assertions(1);
      try {
        mq = new MQ(amqp);
      } catch (e) {
        expect(e.message).toBe('options is required');
      }
    });
    test('should throw if `options` arg has no valid url', async () => {
      expect.assertions(1);
      try {
        mq = new MQ(amqp, {});
      } catch (e) {
        expect(e.message).toBe('options.url is required');
      }
    });
    test('should throw if `options` arg has no name', async () => {
      expect.assertions(1);
      try {
        mq = new MQ(amqp, { url: 'url' });
      } catch (e) {
        expect(e.message).toBe('options.name is required');
      }
    });
    test('should throw if `options` arg has no type', async () => {
      expect.assertions(1);
      try {
        mq = new MQ(amqp, { name: 'name', url: 'url' });
      } catch (e) {
        expect(e.message).toBe('options.type is required');
      }
    });
    test('should throw if `options.type` is not queue || exchange', async () => {
      expect.assertions(1);
      try {
        mq = new MQ(amqp, { name: 'name', url: 'url', type: 'type' });
      } catch (e) {
        expect(e.message).toBe('options.type is not correct type');
      }
    });
    test('should throw if `options.type` is queue and has no queueName', async () => {
      expect.assertions(1);
      try {
        mq = new MQ(amqp, { name: 'name', url: 'url', type: 'queue' });
      } catch (e) {
        expect(e.message).toBe('options.queueName is required');
      }
    });
    test('should throw if `options.type` is exchange and has no exchangeName', async () => {
      expect.assertions(1);
      try {
        mq = new MQ(amqp, { name: 'name', url: 'url', type: 'exchange' });
      } catch (e) {
        expect(e.message).toBe('options.exchangeName is required');
      }
    });
    test('should throw if `options.type` is exchange and has no exchangeType', async () => {
      expect.assertions(1);
      try {
        mq = new MQ(amqp, {
          name: 'name',
          url: 'url',
          type: 'exchange',
          exchangeName: 'exchangeName',
        });
      } catch (e) {
        expect(e.message).toBe('options.exchangeType is required');
      }
    });
    test('should throw if `options.type` is exchange and has no exchangeType', async () => {
      expect.assertions(1);
      try {
        mq = new MQ(amqp, {
          name: 'name',
          url: 'url',
          type: 'exchange',
          exchangeName: 'exchangeName',
          exchangeType: 'exchangeType',
        });
      } catch (e) {
        expect(e.message).toBe('options.routingPrefix is required');
      }
    });
    test('should not throw if arg are valid', async () => {
      expect.assertions(0);
      try {
        mq = new MQ(amqp, {
          name: 'name',
          url: 'url',
          type: 'exchange',
          exchangeName: 'exchangeName',
          exchangeType: 'exchangeType',
          routingPrefix: 'routingPrefix',
        });
        mq = new MQ(amqp, {
          name: 'name',
          url: 'url',
          queueName: 'queueName',
          type: 'queue',
        });
      } catch (e) {
        expect(e.message).not.toBe();
      }
    });
  });
  describe('consume', () => {
    test('should consume', async () => {
      mq.connect = jest.fn(async () => {
        mq.channel = {
          consume: jest.fn(),
        };
      });
      await mq.consume();
      expect(mq.connect).toHaveBeenCalledTimes(1);
      expect(mq).toHaveProperty('channel');
      expect(mq.channel.consume).toHaveBeenCalledTimes(1);
      const qName = mq.channel.consume.mock.calls[0][0];
      expect(qName).toBe(mockOptions.queueName);
    });
    test('should pull messages from queue', async (done) => {
      expect.assertions(2);
      const options = {
        name: 'name',
        url: AMQP_URL,
        type: 'queue',
        queueName: `MQ.TEST.QUEUE-PULL-${(new Date()).getTime()}`,
      };
      const publisher = new MQ(amqp, options);
      await publisher.publish('eventName', 'payload');
      mq = new MQ(amqp, options);
      mq.on('update', (msg) => {
        const result = JSON.parse(msg);
        expect(result.payload).toBe('payload');
        expect(result.name).toBe('eventName');
        done();
      });
      await mq.consume();
    });
    test('should consume after reconnect', async (done) => {
      expect.assertions(2);
      const options = {
        name: 'name',
        url: AMQP_URL,
        type: 'queue',
        queueName: `MQ.TEST.QUEUE-PULL-${(new Date()).getTime()}`,
      };
      mq = new MQ(amqp, options);
      mq.on('update', (msg) => {
        const result = JSON.parse(msg);
        expect(result.payload).toBe('payload');
        expect(result.name).toBe('eventName');
        done();
      });
      mq.on('error', onError);
      await mq.consume();
      await delay(4);
      await mq.stop();
      await mq.reconnect();
      const publisher = new MQ(amqp, options);
      await publisher.publish('eventName', 'payload');
    });
  });
  describe('stop', () => {
    test('should try to stop connection', async () => {
      const close = jest.fn();
      mq.connection = {
        close,
      };
      mq.channel = 'channel';
      await mq.stop();
      expect(close).toHaveBeenCalled();
      expect(mq.connecting).toBeUndefined();
      expect(mq.connection).toBeUndefined();
      expect(mq.channel).toBeUndefined();
    });
    test('should not throw error if connection has error', async () => {
      const close = jest.fn(() => {
        throw new Error('closing-error');
      });
      mq.connection = {
        close,
      };
      expect.assertions(0);
      try {
        await mq.stop();
      } catch (e) {
        expect(e).toBeUndefined();
      }
    });
    test('should not throw error if there is no active connection', async () => {
      mq.connection = null;
      expect.assertions(0);
      try {
        await mq.stop();
      } catch (e) {
        expect(e).toBeUndefined();
      }
    });
  });
  describe('connect', () => {
    test('should stop and reconnect if amqp fails', async () => {
      mockAmqp.connect = jest.fn(() => {
        throw new Error('connection-error');
      });
      mq.reconnect = jest.fn();
      await mq.connect();
      expect(mq.reconnect).toHaveBeenCalled();
    });
    test('should return current connection if it is connecting', async () => {
      mq.connecting = new Promise((resolve) => {
        mq.connection = 'connection';
        resolve(mq.connection);
      });
      const result = await mq.connect();
      expect(result).toBe(mq.connection);
      expect(mockAmqp.connect).not.toHaveBeenCalled();
    });
    test('should reconnect if connection gets closed', async () => {
      const connection = new EventEmitter();
      mockAmqp.connect = jest.fn(() => connection);
      mq.reconnect = jest.fn();
      await mq.connect();
      connection.emit('close');
      expect(mq.reconnect).toHaveBeenCalled();
    });
    test('should log if connection gets error', async () => {
      const connection = new EventEmitter();
      mockAmqp.connect = jest.fn(() => connection);
      mq.reconnect = jest.fn();
      await mq.connect();
      const err = new Error('connection-error');
      await connection.emit('error', err);
      expect(onError).toHaveBeenCalledWith('Connection error', err, { name: 'name.queueName' });
    });
  });
  describe('createChannel', () => {
    test('should return current connection if it has', async () => {
      mq.connection = {
        createChannel: jest.fn(),
      };
      mq.channel = 'channel';
      const result = await mq.createChannel();
      expect(result).toBe(mq.channel);
      expect(mq.connection.createChannel).not.toHaveBeenCalled();
    });
    test('should throw error if there is no connection', async () => {
      mq.connection = null;
      const result = await mq.createChannel();
      expect(result).toBeInstanceOf(Error);
    });
  });
  describe('assert', () => {
    test('should throw error if try to assert invalid type', async () => {
      expect.assertions(1);
      try {
        mq.options.type = 'type';
        await mq.assert('channel');
      } catch (e) {
        expect(e.message).toBe('Queue Assertion Error');
      }
    });
  });
  describe('publish', () => {
    let queueName;
    beforeEach(() => {
      queueName = `MQ.TEST.SINGLE_QUEUE-${(new Date()).getTime()}`;
      mq = new MQ(amqp, {
        name: 'name',
        url: AMQP_URL,
        type: 'queue',
        queueName,
      });
    });
    test('should create only one connection', async () => {
      const testCount = 20;
      const margin = 5;
      jest.setTimeout((margin * 4) * msInSec);
      const connectionUrl = `${AMQP_HTTP_TEST_URL}/api/connections`;
      const QsUrl = `${AMQP_HTTP_TEST_URL}/api/queues`;
      const opts = {
        auth: {
          user: 'guest',
          pass: 'guest',
        },
        json: true,
      };
      const getCount = async () => {
        await delay(margin);
        opts.url = connectionUrl;
        const response = await request(opts);
        return response.length;
      };
      const getCountOfMessages = async () => {
        await delay(margin);
        opts.url = QsUrl;
        const response = await request(opts);
        return response.filter(q => q.name === queueName)[0].messages;
      };
      const oldCount = await getCount();
      await Promise.all(Array.from(Array(testCount)).map(() => mq.publish('test', { date: new Date() })));
      const count = await getCount();
      const messageCount = await getCountOfMessages();
      expect(count).toBe(oldCount + 1);
      expect(messageCount).toBe(testCount);
    });
  });
  describe('reconnect', () => {
    const { now } = Date;
    beforeEach(() => {
      mq.name = 'mq.name';
      mq.stop = jest.fn();
      mq.connect = jest.fn();
      jest.spyOn(Math, 'random').mockImplementation(() => 0.0001);
      Date.now = jest.fn().mockReturnValue('time');
    });
    afterAll(() => {
      Date.now = now;
    });
    test('should set dynamic reconnectId', async () => {
      await mq.reconnect();
      expect(mq.stop).toHaveBeenCalledWith('time');
    });
    test('should use reconnectId if there is', async () => {
      await mq.reconnect('id');
      expect(mq.stop).toHaveBeenCalledWith('id');
    });
    test('should trigger stop with reconnectId', async () => {
      await mq.reconnect('reconnectId');
      expect(mq.stop).toHaveBeenCalledWith('reconnectId');
    });
    test('should trigger connect with reconnectId', async () => {
      await mq.reconnect('reconnectId');
      expect(mq.connect).toHaveBeenCalledWith('reconnectId');
    });
  });
});
