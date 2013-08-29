/**
 * An atempt at mapping Solr-4.4.0 into Backbone's Model and Collection objects
 * using the REST interface Solr provides.
 * The implementation is only tested for the example-schemaless configuation
 * that Solr provides with their official downloads.
 *
 * The idea is that the implementation should support default usage of Backbone.
 * Though that may not (yet) be the case.
 */
(function ($, undefined) {
	'use strict';

	var uuid = window.uuid;

	/**
	 *
	 */
	var SolrModel = Backbone.Model.extend({

		_stringifyMultiObjects: function (attributes) {
			return this._traverseMultiObjects(attributes, function (arrVal) {
				if (_.isObject(arrVal)) {
					return JSON.stringify(arrVal);
				} else {
					return arrVal;
				}
			});
		},

		_parseMultiObjects: function (attributes) {
			return this._traverseMultiObjects(attributes, function (arrVal) {
				try {
					return JSON.parse(arrVal);
				} catch (e) {
					return arrVal;
				}
			});
		},

		_traverseMultiObjects: function (attributes, callback) {
			var attrs = {};
			_.each(attributes, function (value, key) {
				if (_.isArray(value)) {
					value = _.map(value, function (arrVal) {
						return callback(arrVal);
					});
				}

				attrs[key] = value;
			});

			return attrs;
		},

		_parseToSolrData: function (method) {
			if (method === 'delete') {
				// Only ID
				return { id : this.id };
			} else {
				// All attributes, including ID
				// This is necessary since Solr does not make a difference between update
				// and create.
				var attributes = _.omit(this.attributes, '_version_');

				// Solr specifies _version_ attribute to distinguish between
				// create and update. See http://yonik.com/solr/optimistic-concurrency/
				// attributes._version_ = method === 'create' ? 0.5 : 1;

				attributes = this._stringifyMultiObjects(attributes);

				return { 'add': { 'doc': attributes } };
			}
		},

		urlRoot: function (method) {
			return this.collection.url + '/' +
				(method === 'read' ? 'get?wt=json' : 'update?wt=json&commit=true');
		},

		sync: function (method, model, options) {
			if (method === 'create') {
				if (this.has('id')) { throw 'ERROR: Trying to create new comment with already existing ID'; }
				this.set('id', uuid.v4(), { silent: true });
			}

			options.url = model.urlRoot(method);

			if (method !== 'read') {
				options.contentType = 'application/json';
				options.method = 'POST';
			} else {
				// We only support fetching single Models by ID so far
				options.method = 'GET';
				options.data = {
					id: model.get('id')
				};

				return Backbone.Model.prototype.sync.apply(this, arguments);
			}

			var data = this._parseToSolrData(method);

			return Backbone.ajax(_.extend({
				data: JSON.stringify(data),
			}, options));
		},

		parse: function (fields) {
			// Prevents odd returns from Solr after a save
			if (!_.isObject(fields)) {
				return;
			}

			// Fetching a model separately will produce this response
			if (fields.response && fields.response.docs) {
				fields = fields.response.docs[0];
			} else if (fields.doc !== undefined) {
				fields = fields.doc;
			}

			return this._parseMultiObjects(fields);
		}
	});

	var SolrCollection = Backbone.Collection.extend({
		model: SolrModel,

		parse: function (response) {
			var jsonArray = [];

			_.each(response.response.docs, function (doc) {
				jsonArray.push(doc);
			});

			return jsonArray;
		},

		_splitQuery: function (query) {
			var string = "";
			_.each(query, function (value, key) {
				string += key + ':' + '"' + value + '"' + '&';
			});
			return _.initial(string.split('&')).join('&');
		},

		sync: function (method, model, options) {
			if (method === 'read') {
				options.url = this.url + '/select';

				options.data = options.data || {};

				// TODO, this should probably be extracted from here into Authoring itself
				(options = options || {}).data = {
					fq: 'modeltype:' + options.query.modeltype,
					q: this._splitQuery(_.omit(options.query, 'modeltype')),
					wt: 'json'
				};

			}

			return Backbone.Collection.prototype.sync.apply(this, arguments);
		}
	});

	window.SolrBackbone = {
		Model: SolrModel,
		Collection: SolrCollection
	};
}(jQuery));