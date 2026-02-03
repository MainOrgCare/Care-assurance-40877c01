import * as XLSX from 'xlsx';

interface Call {
  id: string;
  serviceUserName: string;
  startTime: string;
  endTime: string;
  duration: number;
  isDoubleUp: boolean;
  isTimeCritical: boolean;
  callType: string;
  address?: string;
}

interface Worker {
  name: string;
  calls: Call[];
  totalCalls: number;
  totalMinutes: number;
  totalServiceUsers: number;
  startTime?: string;
  endTime?: string;
}

interface ExportData {
  weekNumber: string;
  weekDay: string;
  workers: Worker[];
  metrics: {
    totalCalls: number;
    totalHours: number;
    totalWorkers: number;
    conflicts: number;
    avgCallsPerWorker: number;
    avgHoursPerWorker: number;
  };
  optimizationScore?: number;
}

export function exportRosterToExcel(data: ExportData, filename: string = 'roster-schedule.xlsx') {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summaryData = [
    ['Care Worker Roster Schedule'],
    [''],
    ['Week:', data.weekNumber],
    ['Day:', data.weekDay],
    ['Generated:', new Date().toLocaleString()],
    [''],
    ['Summary Metrics'],
    ['Total Workers', data.metrics.totalWorkers],
    ['Total Calls', data.metrics.totalCalls],
    ['Total Hours', Math.round(data.metrics.totalHours * 10) / 10],
    ['Schedule Conflicts', data.metrics.conflicts],
    ['Avg Calls/Worker', Math.round(data.metrics.avgCallsPerWorker * 10) / 10],
    ['Avg Hours/Worker', Math.round(data.metrics.avgHoursPerWorker * 10) / 10],
  ];

  if (data.optimizationScore !== undefined) {
    summaryData.push(['Optimization Score', `${data.optimizationScore}/100`]);
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  
  // Set column widths
  summarySheet['!cols'] = [
    { wch: 25 },
    { wch: 20 }
  ];

  // Add summary sheet
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Sheet 2: Schedule by Worker
  const scheduleData: any[][] = [
    ['Worker', 'Start Time', 'End Time', 'Calls', 'Hours', 'Service Users'],
    ...data.workers.map(worker => [
      worker.name,
      worker.startTime || '—',
      worker.endTime || '—',
      worker.totalCalls,
      Math.round(worker.totalMinutes / 60 * 10) / 10,
      worker.totalServiceUsers
    ])
  ];

  const scheduleSheet = XLSX.utils.aoa_to_sheet(scheduleData);
  
  scheduleSheet['!cols'] = [
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 8 },
    { wch: 10 },
    { wch: 15 }
  ];

  XLSX.utils.book_append_sheet(workbook, scheduleSheet, 'Worker Summary');

  // Sheet 3: Detailed Calls (One sheet per worker, up to 10 workers)
  data.workers.slice(0, 10).forEach((worker, workerIdx) => {
    const callsData: any[][] = [
      [`${worker.name} - Call Schedule`],
      [''],
      ['Service User', 'Start Time', 'End Time', 'Duration (min)', 'Type', 'Critical', 'Double-Up', 'Address'],
      ...worker.calls.map(call => [
        call.serviceUserName,
        call.startTime,
        call.endTime,
        call.duration,
        call.callType,
        call.isTimeCritical ? 'YES' : 'No',
        call.isDoubleUp ? 'YES' : 'No',
        call.address || '—'
      ])
    ];

    const callsSheet = XLSX.utils.aoa_to_sheet(callsData);
    
    callsSheet['!cols'] = [
      { wch: 25 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 10 },
      { wch: 12 },
      { wch: 40 }
    ];

    // Truncate worker name to 31 chars (Excel sheet name limit)
    const sheetName = worker.name.substring(0, 28) + (worker.name.length > 28 ? '...' : '');
    XLSX.utils.book_append_sheet(workbook, callsSheet, sheetName);
  });

  // Sheet 4: Call List (All calls)
  const allCallsData: any[][] = [
    ['All Calls - Full Schedule'],
    [''],
    ['Worker', 'Service User', 'Start Time', 'End Time', 'Duration', 'Type', 'Critical', 'Double-Up'],
  ];

  data.workers.forEach(worker => {
    worker.calls.forEach(call => {
      allCallsData.push([
        worker.name,
        call.serviceUserName,
        call.startTime,
        call.endTime,
        call.duration,
        call.callType,
        call.isTimeCritical ? 'YES' : 'No',
        call.isDoubleUp ? 'YES' : 'No'
      ]);
    });
  });

  const allCallsSheet = XLSX.utils.aoa_to_sheet(allCallsData);
  
  allCallsSheet['!cols'] = [
    { wch: 20 },
    { wch: 25 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 15 },
    { wch: 10 },
    { wch: 12 }
  ];

  XLSX.utils.book_append_sheet(workbook, allCallsSheet, 'All Calls');

  // Export the file
  XLSX.writeFile(workbook, filename);
}

export function exportWorkerScheduleToExcel(
  workerName: string,
  calls: Call[],
  weekNumber: string,
  weekDay: string,
  filename?: string
) {
  const workbook = XLSX.utils.book_new();

  // Summary
  const totalMinutes = calls.reduce((sum, call) => sum + call.duration, 0);
  const uniqueServiceUsers = new Set(calls.map(c => c.serviceUserName)).size;

  const summaryData = [
    [`${workerName} - Schedule`],
    [''],
    ['Week:', weekNumber],
    ['Day:', weekDay],
    [''],
    ['Total Calls:', calls.length],
    ['Total Hours:', Math.round(totalMinutes / 60 * 10) / 10],
    ['Service Users:', uniqueServiceUsers],
    ['Time-Critical Calls:', calls.filter(c => c.isTimeCritical).length],
    ['Double-Up Calls:', calls.filter(c => c.isDoubleUp).length],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 25 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Detailed calls
  const callsData: any[][] = [
    ['Service User', 'Start Time', 'End Time', 'Duration (min)', 'Type', 'Critical', 'Double-Up', 'Address'],
    ...calls.map(call => [
      call.serviceUserName,
      call.startTime,
      call.endTime,
      call.duration,
      call.callType,
      call.isTimeCritical ? 'YES' : 'No',
      call.isDoubleUp ? 'YES' : 'No',
      call.address || '—'
    ])
  ];

  const callsSheet = XLSX.utils.aoa_to_sheet(callsData);
  callsSheet['!cols'] = [
    { wch: 25 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 15 },
    { wch: 10 },
    { wch: 12 },
    { wch: 40 }
  ];

  XLSX.utils.book_append_sheet(workbook, callsSheet, 'Calls');

  // Export
  const defaultFilename = `${workerName.replace(/[^a-z0-9]/gi, '-')}-${weekDay}-${weekNumber}.xlsx`;
  XLSX.writeFile(workbook, filename || defaultFilename);
}
