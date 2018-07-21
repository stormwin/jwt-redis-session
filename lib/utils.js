'use strict';

const jwt = require('jsonwebtoken'),
	uuid = require('node-uuid'),
	{ promisify } = require('util');


const extendSession = (session, data) => {
	return Object.entries(data).reduce((memo, [key, val]) => {
		if (typeof val !== 'function' && key !== 'id') {
			memo[key] = val;
		}
		return memo;
	}, session);
};

const serializeSession = (session) => {
	const result = {};
	Object.entries(session).forEach(([key, value]) => {
		if (typeof value !== 'function' && key !== 'id') {
			result[key] = value;
		}
	});

	return result;
};

// these are bound to the session
module.exports = (options) => {
	const RedisSetEx = promisify(options.client.setex).bind(options.client);
	const RedisExpire = promisify(options.client.expire).bind(options.client);
	const RedisGet = promisify(options.client.get).bind(options.client);
	const RedisDel = promisify(options.client.del).bind(options.client);
	return {

		// create a new session and return the jwt
		create: function (claims) {
			return new Promise(async (resolve, reject) => {
				try {
					const sid = uuid.v4();
					const token = jwt.sign(Object.assign({ jti: sid }, claims || {}), options.secret, { algorithm: options.algorithm });
					await RedisSetEx(options.keyspace + sid, options.maxAge, JSON.stringify(serializeSession(this)));
					this.id = sid;
					resolve(token);
				} catch (error) {
					return reject(error);
				}
			});
		},

		// update the TTL on a session
		touch: function () {
			return new Promise(async (resolve, reject) => {
				try {
					if (!this.id) {
						throw (new Error('Invalid session ID'));
					}
					await RedisExpire(options.keyspace + this.id, options.maxAge);
					return resolve();
				} catch (error) {
					return reject(error);
				}
			});
		},

		// update a session's data, update the ttl
		update: function () {
			return new Promise(async (resolve, reject) => {

				try {
					if (!this.id) {
						throw (new Error('Invalid session ID'));
					}
					await RedisSetEx(options.keyspace + this.id, options.maxAge, JSON.stringify(serializeSession(this)));
					return resolve();
				} catch (error) {
					return reject(error);
				}
			});
		},

		// reload a session data from redis
		reload: function () {
			return new Promise(async (resolve, reject) => {
				try {
					if (!this.id) {
						throw (new Error('Invalid session ID'));
					}
					let resp = await RedisGet(options.keyspace + this.id);
					resp = JSON.parse(resp);
					extendSession(this, resp);
					return resolve();
				} catch (error) {
					return reject(error);
				}
			});
		},

		// destroy a session
		destroy: function () {
			return new Promise(async (resolve, reject) => {
				try {
					if (!this.id) {
						throw(new Error('Invalid session ID'));
					}
					await RedisDel(options.keyspace + this.id);
					return resolve();
				} catch (error) {
					return reject(error);
				}
			});
		},

		toJSON: function () {
			return serializeSession(this);
		}
	};
};
