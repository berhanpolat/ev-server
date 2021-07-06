import global, { FilterParams } from '../../types/GlobalType';

import BackendError from '../../exception/BackendError';
import Constants from '../../utils/Constants';
import { DataResult } from '../../types/DataResult';
import DatabaseUtils from './DatabaseUtils';
import DbParams from '../../types/database/DbParams';
import Logging from '../../utils/Logging';
import OCPIEndpoint from '../../types/ocpi/OCPIEndpoint';
import { OCPIRole } from '../../types/ocpi/OCPIRole';
import { ObjectID } from 'mongodb';
import Tenant from '../../types/Tenant';
import Utils from '../../utils/Utils';

const MODULE_NAME = 'OCPIEndpointStorage';

export default class OCPIEndpointStorage {
  static async getOcpiEndpoint(tenant: Tenant, id: string, projectFields?: string[]): Promise<OCPIEndpoint> {
    const endpointsMDB = await OCPIEndpointStorage.getOcpiEndpoints(
      tenant, { ocpiEndpointIDs: [id] }, Constants.DB_PARAMS_SINGLE_RECORD, projectFields);
    return endpointsMDB.count === 1 ? endpointsMDB.result[0] : null;
  }

  static async getOcpiEndpointByLocalToken(tenant: Tenant, token: string, projectFields?: string[]): Promise<OCPIEndpoint> {
    const endpointsMDB = await OCPIEndpointStorage.getOcpiEndpoints(
      tenant, { localToken: token }, Constants.DB_PARAMS_SINGLE_RECORD, projectFields);
    return endpointsMDB.count === 1 ? endpointsMDB.result[0] : null;
  }

  static async saveOcpiEndpoint(tenant: Tenant, ocpiEndpointToSave: OCPIEndpoint): Promise<string> {
    // Debug
    const uniqueTimerID = Logging.traceStart(tenant.id, MODULE_NAME, 'saveOcpiEndpoint');
    // Check Tenant
    DatabaseUtils.checkTenantObject(tenant);
    // Check if name is provided
    if (!ocpiEndpointToSave.name) {
      // Name must be provided!
      throw new BackendError({
        source: Constants.CENTRAL_SERVER,
        module: MODULE_NAME,
        method: 'saveOcpiEndpoint',
        message: 'OCPIEndpoint has no Name'
      });
    }
    const ocpiEndpointFilter: any = {};
    // Build Request
    if (ocpiEndpointToSave.id) {
      ocpiEndpointFilter._id = DatabaseUtils.convertToObjectID(ocpiEndpointToSave.id);
    } else {
      ocpiEndpointFilter._id = new ObjectID();
    }
    const ocpiEndpointMDB: any = {
      _id: ocpiEndpointFilter._id,
      name: ocpiEndpointToSave.name,
      role: ocpiEndpointToSave.role,
      baseUrl: ocpiEndpointToSave.baseUrl,
      localToken: ocpiEndpointToSave.localToken,
      token: ocpiEndpointToSave.token,
      countryCode: ocpiEndpointToSave.countryCode,
      partyId: ocpiEndpointToSave.partyId,
      backgroundPatchJob: Utils.convertToBoolean(ocpiEndpointToSave.backgroundPatchJob),
      status: ocpiEndpointToSave.status,
      version: ocpiEndpointToSave.version,
      businessDetails: ocpiEndpointToSave.businessDetails,
      availableEndpoints: ocpiEndpointToSave.availableEndpoints,
      versionUrl: ocpiEndpointToSave.versionUrl,
      lastPatchJobOn: Utils.convertToDate(ocpiEndpointToSave.lastPatchJobOn),
      lastPatchJobResult: ocpiEndpointToSave.lastPatchJobResult
    };
    // Add Last Changed/Created props
    DatabaseUtils.addLastChangedCreatedProps(ocpiEndpointMDB, ocpiEndpointToSave);
    // Modify
    await global.database.getCollection<OCPIEndpoint>(tenant.id, 'ocpiendpoints').findOneAndUpdate(
      ocpiEndpointFilter,
      { $set: ocpiEndpointMDB },
      { upsert: true, returnDocument: 'after' });
    // Debug
    await Logging.traceEnd(tenant.id, MODULE_NAME, 'saveOcpiEndpoint', uniqueTimerID, ocpiEndpointMDB);
    // Create
    return ocpiEndpointFilter._id.toHexString();
  }

  // Delegate
  static async getOcpiEndpoints(tenant: Tenant,
      params: { search?: string; role?: OCPIRole; ocpiEndpointIDs?: string[]; localToken?: string },
      dbParams: DbParams, projectFields?: string[]): Promise<DataResult<OCPIEndpoint>> {
    // Debug
    const uniqueTimerID = Logging.traceStart(tenant.id, MODULE_NAME, 'getOcpiEndpoints');
    // Check Tenant
    DatabaseUtils.checkTenantObject(tenant);
    // Clone before updating the values
    dbParams = Utils.cloneObject(dbParams);
    // Check Limit
    dbParams.limit = Utils.checkRecordLimit(dbParams.limit);
    // Check Skip
    dbParams.skip = Utils.checkRecordSkip(dbParams.skip);
    // Create Aggregation
    const aggregation: any[] = [];
    // Set the filters
    const filters: FilterParams = {};
    // Search
    if (params.search) {
      filters.$or = [
        { 'name': { $regex: params.search, $options: 'i' } }
      ];
    }
    if (params.ocpiEndpointIDs) {
      filters._id = {
        $in: params.ocpiEndpointIDs.map((ocpiEndpointID) => DatabaseUtils.convertToObjectID(ocpiEndpointID))
      };
    }
    if (params.localToken) {
      filters.localToken = params.localToken;
    }
    if (params.role) {
      filters.role = params.role;
    }
    // Filters
    if (filters) {
      aggregation.push({
        $match: filters
      });
    }
    // Limit records?
    if (!dbParams.onlyRecordCount) {
      aggregation.push({ $limit: Constants.DB_RECORD_COUNT_CEIL });
    }
    // Count Records
    const ocpiEndpointsCountMDB = await global.database.getCollection<any>(tenant.id, 'ocpiendpoints')
      .aggregate([...aggregation, { $count: 'count' }])
      .toArray();
    // Check if only the total count is requested
    if (dbParams.onlyRecordCount) {
      await Logging.traceEnd(tenant.id, MODULE_NAME, 'getOcpiEndpoints', uniqueTimerID, ocpiEndpointsCountMDB);
      return {
        count: (ocpiEndpointsCountMDB.length > 0 ? ocpiEndpointsCountMDB[0].count : 0),
        result: []
      };
    }
    // Remove the limit
    aggregation.pop();
    // Add Created By / Last Changed By
    DatabaseUtils.pushCreatedLastChangedInAggregation(tenant.id, aggregation);
    // Handle the ID
    DatabaseUtils.pushRenameDatabaseID(aggregation);
    // Sort
    if (!dbParams.sort) {
      dbParams.sort = { name: 1 };
    }
    aggregation.push({
      $sort: dbParams.sort
    });
    // Skip
    aggregation.push({
      $skip: dbParams.skip
    });
    // Limit
    aggregation.push({
      $limit: dbParams.limit
    });
    // Project
    DatabaseUtils.projectFields(aggregation, projectFields);
    // Read DB
    const ocpiEndpointsMDB = await global.database.getCollection<OCPIEndpoint>(tenant.id, 'ocpiendpoints')
      .aggregate(aggregation, {
        allowDiskUse: true
      })
      .toArray();
    // Debug
    await Logging.traceEnd(tenant.id, MODULE_NAME, 'getOcpiEndpoints', uniqueTimerID, ocpiEndpointsMDB);
    // Ok
    return {
      count: (ocpiEndpointsCountMDB.length > 0 ? ocpiEndpointsCountMDB[0].count : 0),
      result: ocpiEndpointsMDB
    };
  }

  static async deleteOcpiEndpoint(tenant: Tenant, id: string): Promise<void> {
    // Debug
    const uniqueTimerID = Logging.traceStart(tenant.id, MODULE_NAME, 'deleteOcpiEndpoint');
    // Check Tenant
    DatabaseUtils.checkTenantObject(tenant);
    // Delete OcpiEndpoint
    await global.database.getCollection<OCPIEndpoint>(tenant.id, 'ocpiendpoints')
      .findOneAndDelete({ '_id': DatabaseUtils.convertToObjectID(id) });
    // Debug
    await Logging.traceEnd(tenant.id, MODULE_NAME, 'deleteOcpiEndpoint', uniqueTimerID, { id });
  }

  static async deleteOcpiEndpoints(tenant: Tenant): Promise<void> {
    // Debug
    const uniqueTimerID = Logging.traceStart(tenant.id, MODULE_NAME, 'deleteOcpiEndpoints');
    // Check Tenant
    DatabaseUtils.checkTenantObject(tenant);
    // Delete OcpiEndpoint
    await global.database.getCollection<OCPIEndpoint>(tenant.id, 'ocpiendpoints').deleteMany({});
    // Debug
    await Logging.traceEnd(tenant.id, MODULE_NAME, 'deleteOcpiEndpoints', uniqueTimerID);
  }
}
