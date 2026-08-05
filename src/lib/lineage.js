import config from './config.js';
import { getLogger } from './logger.js';

const DEFAULT_RELATION = 'http://schema.org/source';

/**
 * @class Lineage
 * @description Structural metadata: file-to-file derivative/lineage links (e.g. a silver file
 * derived from a bronze file). Kept separate from the Layer 3 RDF graph — see
 * docs/structural-metadata.md for the rationale. Edges are keyed by file_id on both ends, so
 * they survive file renames/moves.
 */
class Lineage {

  constructor() {
    this.logger = getLogger('lineage');
  }

  /**
   * @method addLink
   * @description Record that one file was derived from another. Upserts on a repeat call for
   * the same (from, to, relation) triple, replacing the metadata.
   *
   * @param {Object} opts
   * @param {String} opts.fromFileId Required. file_id of the derivative (e.g. silver file)
   * @param {String} opts.toFileId Required. file_id of the source (e.g. bronze file)
   * @param {String} [opts.relation] relation URI. Default: http://schema.org/source
   * @param {String} [opts.metadata] free-form text carried alongside the link
   * @param {Object} opts.dbClient Required. database client instance
   *
   * @returns {Promise<Object>} the created/updated derivative_link row
   */
  async addLink(opts={}) {
    const { fromFileId, toFileId, dbClient } = opts;
    const relation = opts.relation || DEFAULT_RELATION;
    const metadata = opts.metadata || '';

    if( !fromFileId || !toFileId || !dbClient ) {
      throw new Error('fromFileId, toFileId and dbClient are required');
    }
    if( fromFileId === toFileId ) {
      throw new Error('fromFileId and toFileId cannot be the same file');
    }

    const res = await dbClient.query(`
      INSERT INTO ${config.database.schema}.derivative_link (from_file_id, to_file_id, relation, metadata)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (from_file_id, to_file_id, relation)
      DO UPDATE SET metadata = EXCLUDED.metadata, modified = NOW()
      RETURNING *
    `, [fromFileId, toFileId, relation, metadata]);

    return res.rows[0];
  }

  /**
   * @method removeLink
   * @description Remove a derivative link between two files.
   *
   * @param {Object} opts
   * @param {String} opts.fromFileId Required. file_id of the derivative
   * @param {String} opts.toFileId Required. file_id of the source
   * @param {String} [opts.relation] relation URI. Default: http://schema.org/source
   * @param {Object} opts.dbClient Required. database client instance
   *
   * @returns {Promise<Object>} result of the delete query
   */
  async removeLink(opts={}) {
    const { fromFileId, toFileId, dbClient } = opts;
    const relation = opts.relation || DEFAULT_RELATION;

    if( !fromFileId || !toFileId || !dbClient ) {
      throw new Error('fromFileId, toFileId and dbClient are required');
    }

    return dbClient.query(`
      DELETE FROM ${config.database.schema}.derivative_link
      WHERE from_file_id = $1 AND to_file_id = $2 AND relation = $3
      RETURNING derivative_link_id
    `, [fromFileId, toFileId, relation]);
  }

  /**
   * @method getDerivatives
   * @description Get files that were derived from the given file (the given file is the source).
   *
   * @param {Object} opts
   * @param {String} opts.fileId Required. file_id to look up derivatives for
   * @param {String} [opts.relation] filter by relation URI
   * @param {Object} opts.dbClient Required. database client instance
   *
   * @returns {Promise<Array>} array of derivative_link_view rows
   */
  async getDerivatives(opts={}) {
    const { fileId, dbClient } = opts;
    if( !fileId || !dbClient ) {
      throw new Error('fileId and dbClient are required');
    }

    let where = ['to_file_id = $1'];
    let params = [fileId];
    if( opts.relation ) {
      params.push(opts.relation);
      where.push(`relation = $${params.length}`);
    }

    const res = await dbClient.query(`
      SELECT * FROM ${config.database.schema}.derivative_link_view
      WHERE ${where.join(' AND ')}
      ORDER BY created
    `, params);
    return res.rows;
  }

  /**
   * @method getSources
   * @description Get the files the given file was derived from (its lineage ancestors, one hop).
   *
   * @param {Object} opts
   * @param {String} opts.fileId Required. file_id to look up sources for
   * @param {String} [opts.relation] filter by relation URI
   * @param {Object} opts.dbClient Required. database client instance
   *
   * @returns {Promise<Array>} array of derivative_link_view rows
   */
  async getSources(opts={}) {
    const { fileId, dbClient } = opts;
    if( !fileId || !dbClient ) {
      throw new Error('fileId and dbClient are required');
    }

    let where = ['from_file_id = $1'];
    let params = [fileId];
    if( opts.relation ) {
      params.push(opts.relation);
      where.push(`relation = $${params.length}`);
    }

    const res = await dbClient.query(`
      SELECT * FROM ${config.database.schema}.derivative_link_view
      WHERE ${where.join(' AND ')}
      ORDER BY created
    `, params);
    return res.rows;
  }

}

const impl = new Lineage();
export default impl;
