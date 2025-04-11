import ICAL from 'ical.js';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    // Get encoded parameters from path segments
    const { params = [] } = req.query;
    
    // The first segment is always the encodedUrl
    const encodedUrl = params[0];
    // The second segment is the optional encodedKeywords
    const encodedKeywords = params.length > 1 ? params[1] : null;
    
    if (!encodedUrl) {
      return res.status(400).json({ error: 'Missing encoded URL parameter' });
    }
    
    // Base64 decoding function with URL safe characters
    const base64Decode = (str) => {
      try {
        // Replace URL-safe chars and add padding
        const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        const paddedBase64 = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
        
        // Use Buffer in Node.js environment
        return Buffer.from(paddedBase64, 'base64').toString();
      } catch (err) {
        console.error('Base64 decoding error:', err);
        return null;
      }
    };
    
    // Decode URL
    const calendarUrl = base64Decode(encodedUrl);
    
    // Decode keywords if they exist
    const keywords = encodedKeywords ? 
      base64Decode(encodedKeywords).split(',').map(k => k.trim()) : 
      [];
    
    if (!calendarUrl) {
      return res.status(400).json({ error: 'Invalid URL encoding' });
    }
    
    console.log('Fetching calendar from:', calendarUrl);
    console.log('Filtering with keywords:', keywords);
    
    // Fetch and parse iCal data
    const response = await fetch(calendarUrl);
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Failed to fetch calendar: ${response.statusText}` 
      });
    }
    
    const icalData = await response.text();
    
    // Parse iCal data using ICAL.js
    const jcalData = ICAL.parse(icalData);
    const component = new ICAL.Component(jcalData);
    const vevents = component.getAllSubcomponents('vevent');
    
    // Extract events
    const events = vevents.map(vevent => {
      const event = new ICAL.Event(vevent);
      return {
        uid: event.uid,
        summary: event.summary,
        description: event.description,
        location: event.location,
        startDate: event.startDate.toJSDate(),
        endDate: event.endDate.toJSDate(),
        // Store original component to preserve all properties
        originalComponent: vevent
      };
    });
    
    console.log(`Fetched ${events.length} events from calendar`);
    
    // Apply keyword filtering if keywords exist
    let filteredEvents = events;
    if (keywords.length > 0) {
      const includeKeywords = keywords.filter(k => !k.startsWith('!'));
      const excludeKeywords = keywords
        .filter(k => k.startsWith('!'))
        .map(k => k.substring(1).trim());
      
      filteredEvents = events.filter(event => {
        const isExcluded = excludeKeywords.some(keyword => 
          event.summary.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (isExcluded) return false;
        
        if (includeKeywords.length === 0) return true;
        
        return includeKeywords.some(keyword => 
          event.summary.toLowerCase().includes(keyword.toLowerCase())
        );
      });
    }
    
    console.log(`Filtered to ${filteredEvents.length} events`);
    
    // Create a new iCal calendar
    const calendar = new ICAL.Component(['vcalendar', [], []]);
    
    // Set required calendar properties
    calendar.updatePropertyWithValue('prodid', '-//iCal Filter//EN');
    calendar.updatePropertyWithValue('version', '2.0');
    calendar.updatePropertyWithValue('calscale', 'GREGORIAN');
    calendar.updatePropertyWithValue('method', 'PUBLISH');

    // Add metadata about the feed (similar to derhuerst-ics-service)
    const title = keywords.length > 0 ? 
      `Filtered Calendar (${keywords.join(', ')})` : 
      'Filtered Calendar';
    calendar.updatePropertyWithValue('x-wr-calname', title);
    
    // Add filtered events to the calendar
    filteredEvents.forEach(event => {
      // Create a new vevent component
      const vevent = new ICAL.Component(['vevent', [], []]);
      
      // Convert dates to ICAL.Time
      const startDate = ICAL.Time.fromJSDate(event.startDate, true);
      const endDate = ICAL.Time.fromJSDate(event.endDate, true);
      
      // Add core properties
      vevent.updatePropertyWithValue('summary', event.summary);
      vevent.updatePropertyWithValue('dtstart', startDate);
      vevent.updatePropertyWithValue('dtend', endDate);
      vevent.updatePropertyWithValue('uid', event.uid || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
      vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
      
      // Add optional properties
      if (event.description) {
        vevent.updatePropertyWithValue('description', event.description);
      }
      if (event.location) {
        vevent.updatePropertyWithValue('location', event.location);
      }
      
      calendar.addSubcomponent(vevent);
    });
    
    // Generate iCal content
    const icsContent = calendar.toString();
    
    // Set proper Content-Type header for iCalendar
    // Using the simpler header from derhuerst-ics-service
    res.setHeader('Content-Type', 'text/calendar');
    
    // Mimic the headers from derhuerst-ics-service/feed.js
    res.setHeader('Cache-Control', 'public,max-age=0');
    
    // Send the iCal content
    res.status(200).send(icsContent);
  } catch (error) {
    console.error('Calendar API error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
