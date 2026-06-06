import client from './client';

export const getReportingOverview = (params) =>
  client.get('/reporting/overview', { params });

export const alertNonLoggers = (days) =>
  client.post('/reporting/alert-non-loggers', null, { params: { days } });

export const getLoadOverview = (params) =>
  client.get('/reporting/load-overview', { params });
