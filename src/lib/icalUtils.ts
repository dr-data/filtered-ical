import ICAL from 'ical.js';

export interface ICalEvent {
  summary: string;
  description: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  uid?: string;
}

export async function fetchAndParseICal(url: string): Promise<ICalEvent[]> {
  try {
    if (!url) {
      throw new Error('No URL provided');
    }

    const response = await fetch(url, {
      headers: {
        'Accept': 'text/calendar',
      },
    });
    
    if (!response.ok) {
      throw new Error(
        `Failed to fetch calendar: ${response.status} ${response.statusText}\n` +
        `URL: ${url}`
      );
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('text/calendar') && !contentType?.includes('text/plain')) {
      console.warn(
        `Warning: Unexpected content type "${contentType}". ` +
        `Expected "text/calendar" or "text/plain". Attempting to parse anyway.`
      );
    }
    
    const icalData = await response.text();
    
    if (!icalData.trim()) {
      throw new Error('Received empty calendar data');
    }

    try {
      const jcalData = ICAL.parse(icalData);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');

      return vevents.map(vevent => {
        const event = new ICAL.Event(vevent);
        return {
          summary: event.summary,
          description: event.description || '',
          startDate: event.startDate.toJSDate(),
          endDate: event.endDate.toJSDate(),
          location: event.location,
          uid: event.uid
        };
      });
    } catch (parseError) {
      throw new Error(
        `Failed to parse calendar data: ${parseError.message}\n` +
        'This might indicate that the response is not a valid iCal format.'
      );
    }
  } catch (error) {
    // Convert any error to a more user-friendly format
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Calendar fetch error:', {
      message: errorMessage,
      url: url,
      error: error
    });
    throw new Error(`Failed to fetch calendar: ${errorMessage}`);
  }
}

export function generateICS(events: ICalEvent[]): string {
  const calendar = new ICAL.Component(['vcalendar', [], []]);
  
  // Set required calendar properties
  calendar.updatePropertyWithValue('prodid', '-//iCal Filter//EN');
  calendar.updatePropertyWithValue('version', '2.0');
  calendar.updatePropertyWithValue('calscale', 'GREGORIAN');
  calendar.updatePropertyWithValue('method', 'PUBLISH');
  
  events.forEach(event => {
    const vevent = new ICAL.Component('vevent');
    
    // Convert dates to ICAL.Time
    const startDate = ICAL.Time.fromJSDate(event.startDate, true);
    const endDate = ICAL.Time.fromJSDate(event.endDate, true);
    
    // Set event properties
    vevent.updatePropertyWithValue('summary', event.summary);
    vevent.updatePropertyWithValue('dtstart', startDate);
    vevent.updatePropertyWithValue('dtend', endDate);
    
    // Generate a unique identifier if none exists
    const uid = event.uid || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    vevent.updatePropertyWithValue('uid', uid);
    
    // Set creation timestamp
    const dtstamp = ICAL.Time.now();
    vevent.updatePropertyWithValue('dtstamp', dtstamp);
    
    if (event.description) {
      vevent.updatePropertyWithValue('description', event.description);
    }
    if (event.location) {
      vevent.updatePropertyWithValue('location', event.location);
    }
    
    calendar.addSubcomponent(vevent);
  });
  
  return calendar.toString();
}

export function downloadICS(events: ICalEvent[], filename = 'filtered-calendar.ics'): void {
  const icsContent = generateICS(events);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}