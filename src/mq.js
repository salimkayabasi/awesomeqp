const EventEmitter = require('events');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const TYPES = {
  queue: 'queue',
  exchange: 'exchange',
};

module.exports = class MQ extends EventEmitter {
  constructor(amqp, options) {
    super();
    MQ.validate(amqp, options);
    this.lib = {
      amqp,
    };
    this.name = `${options.name}.${options.queueName || options.exchangeName}`;
    this.options = options;
  }

  static validate(amqp, options) {
    if (typeof amqp === 'undefined') {
      throw new Error('amqp module is required');
    }
    if (typeof options === 'undefined') {
      throw new Error('options is required');
    }
    if (typeof options.url === 'undefined') {
      throw new Error('options.url is required');
    }
    if (typeof options.name === 'undefined') {
      throw new Error('options.name is required');
    }
    if (typeof options.type === 'undefined') {
      throw new Error('options.type is required');
    }
    if (!Object.keys(TYPES).includes(options.type)) {
      throw new Error(`options.type is not correct ${options.type}`);
    }
    if (options.type === TYPES.queue && typeof options.queueName === 'undefined') {
      throw new Error('options.queueName is required');
    }
    if (options.type === TYPES.exchange) {
      if (typeof options.exchangeName === 'undefined') {
        throw new Error('options.exchangeName is required');
      }
      if (typeof options.exchangeType === 'undefined') {
        throw new Error('options.exchangeType is required');
      }
      if (typeof options.routingPrefix === 'undefined') {
        throw new Error('options.routingPrefix is required');
      }
    }
  }

  getFormattedMessage(eventName, payload) {
    const { msg } = this.options;
    const version = (msg && msg.version) || '1';
    const name = (msg && msg.serviceName) ? `${msg.serviceName}.${eventName}` : eventName;
    const message = {
      version,
      name,
      timestamp: new Date(),
      payload: payload || {},
    };
    return Buffer.from(JSON.stringify(message));
  }

  async consume() {
    this.isConsumer = true;
    await this.connect();
    const { queueName } = this.options;
    this.emit('info', 'Consuming messages', { queueName });
    this.channel.consume(queueName, async (msg) => {
      if (msg != null) {
        this.emit('update', msg.content);
        this.channel.ack(msg);
      }
    });
  }

  async publish(eventName, payload) {
    await this.connect();
    const { queueName } = this.options;
    const msg = this.getFormattedMessage(eventName, payload);
    try {
      await this.channel.sendToQueue(queueName, msg);
      this.emit('debug', 'message sent to Q', { name: this.name });
    } catch (e) {
      this.emit('error', 'Publish error', e);
    }
  }

  async exchange(eventName, routingKey, payload) {
    await this.connect();
    const { exchangeName, routingPrefix } = this.options;
    const msg = this.getFormattedMessage(eventName, payload);
    try {
      await this.channel.publish(exchangeName, `${routingPrefix}${routingKey}`, msg);
      this.emit('debug', 'message sent to exchange', exchangeName, { routingKey });
    } catch (e) {
      this.emit('error', 'Exchange error', e);
    }
  }

  async assert(channel) {
    const { type } = this.options;
    switch (type) {
      case TYPES.queue:
        return this.assertQueue(channel);
      case TYPES.exchange:
        return this.assertExchange(channel);
      default:
        throw new Error('Queue Assertion Error');
    }
  }

  async assertExchange(channel) {
    const { exchangeName, exchangeType, durable } = this.options;
    try {
      await channel.assertExchange(exchangeName, exchangeType, { durable });
    } catch (e) {
      this.emit('error', 'assertExchange error', e, { name: this.name });
    }
    this.emit('info', 'Exchange created', { name: this.name });
  }

  async assertQueue(channel) {
    const { queueName, durable } = this.options;
    try {
      await channel.assertQueue(queueName, { durable });
    } catch (e) {
      this.emit('error', 'assertQueue error', e, { name: this.name });
    }
    this.emit('info', 'Queue created', { name: this.name });
  }

  async createChannel() {
    if (this.channel) {
      return this.channel;
    }
    const { name } = this;
    if (!this.connection) {
      return new Error('There is no connection yet');
    }
    let channel;
    try {
      channel = await this.connection.createChannel();
    } catch (e) {
      this.emit('error', 'createChannel error', e, { name });
    }
    await this.assert(channel);
    this.channel = channel;
    return this.channel;
  }

  async connect(reconnectId) {
    if (this.connecting) {
      return this.connecting;
    }
    const { amqp } = this.lib;
    const { url } = this.options;
    this.connecting = new Promise(async (resolve) => {
      try {
        this.connection = await amqp.connect(url, {
          clientProperties: {
            product: this.name,
          },
        });
      } catch (e) {
        this.emit('error', 'connection error', e.message, { name: this.name });
        return resolve(this.reconnect(reconnectId));
      }
      this.emit('info', 'Connection established');
      this.connection.on('close', async () => {
        this.emit('error', 'Connection closed', { name: this.name });
        await this.reconnect();
      });
      this.connection.on('error', async (e) => {
        this.emit('error', 'Connection error', e, { name: this.name });
        await this.reconnect();
      });
      await this.createChannel();
      return resolve(this.connection);
    });
    return this.connecting;
  }

  async reconnect(reconnectId = Date.now()) {
    const { name } = this;
    this.emit('info', 'Reconnecting to rabbitmq', { reconnectId, name });
    await this.stop(reconnectId);
    await delay(Math.random() * 3000);
    await this.connect(reconnectId);
    if (this.isConsumer) {
      await this.consume();
    }
  }

  async stop(reconnectId) {
    const { name } = this;
    this.emit('info', 'Stopping', { reconnectId, name });
    try {
      if (this.connection) {
        await this.connection.close();
      }
    } catch (e) {
      this.emit('error', 'Connection closing error', e, { name });
    }
    this.connecting = undefined;
    this.connection = undefined;
    this.channel = undefined;
  }
};
