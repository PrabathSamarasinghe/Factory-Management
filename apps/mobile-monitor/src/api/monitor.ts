import { apiClient } from './client';

export interface MonitorToday {
  date: string;
  attendance: { present: number; absent: number; late: number };
  collections: { totalKg: number; suppliers: number };
  trips: { active: number; completed: number };
  alerts: number;
}

export interface MonitorTrip {
  id: string;
  route: string;
  status: string;
  vehicle?: string;
  startedAt?: string;
}

export interface MonitorAttendance {
  present: number;
  absent: number;
  late: number;
  shifts?: Array<{ name: string; present: number; total: number }>;
}

export interface MonitorCollection {
  totalKg: number;
  supplierCount: number;
  routeCount: number;
  recent?: Array<{ route: string; kg: number }>;
}

export interface MonitorFinance {
  cashOnHand?: number;
  receivables?: number;
  payables?: number;
  currency?: string;
}

export interface MonitorInventory {
  items?: Array<{ name: string; quantity: number; unit: string }>;
  lowStockCount?: number;
}

export async function getToday(): Promise<MonitorToday> {
  return apiClient.get<MonitorToday>('/monitor/today');
}

export async function getTrips(): Promise<MonitorTrip[]> {
  return apiClient.get<MonitorTrip[]>('/monitor/trips');
}

export async function getAttendance(): Promise<MonitorAttendance> {
  return apiClient.get<MonitorAttendance>('/monitor/attendance');
}

export async function getCollections(): Promise<MonitorCollection> {
  return apiClient.get<MonitorCollection>('/monitor/collections');
}

export async function getFinance(): Promise<MonitorFinance> {
  return apiClient.get<MonitorFinance>('/monitor/finance');
}

export async function getInventory(): Promise<MonitorInventory> {
  return apiClient.get<MonitorInventory>('/monitor/inventory');
}
