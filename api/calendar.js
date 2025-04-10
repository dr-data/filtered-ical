import ICAL from 'ical.js';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    // Get encoded parameters from query
    const { encodedUrl, encodedKeywords } = req.query;
    
    if (!encodedUrl) {
      return res.status(400).json({ error: 'Missing encodedUrl parameter' });
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
    
    // Decode parameters
    const calendarUrl = base64Decode(encodedUrl);
    const keywords = encodedKeywords ? base64Decode(encodedKeywords).split(',') : [];
    
    console.log('Decoded URL:', calendarUrl);
    console.log('Decoded Keywords:', keywords);
    
    if (!calendarUrl) {
      return res.status(400).json({ error: 'Invalid URL encoding' });
    }
    
    // Fetch and parse iCal data
    const response = await fetch(calendarUrl);
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Failed to fetch calendar: ${response.statusText}` 
      });
    }
    
    const icalData = await response.text();
    
    // Parse iCal data
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
        endDate: event.endDate.toJSDate()
      };
    });
    
    console.log(`Fetched ${events.length} events from calendar`);
    
    // Apply keyword filtering
    let filteredEvents = events;
    if (keywords && keywords.length > 0) {
      const includeKeywords = keywords.filter(k => !k.startsWith('!'));
      const excludeKeywords = keywords
        .filter(k => k.startsWith('!'))
        .map(k => k.substring(1).trim());
      
      console.log('Include keywords:', includeKeywords);
      console.log('Exclude keywords:', excludeKeywords);
      
      filteredEvents = events.filter(event => {
        const isExcluded = excludeKeywords.some(keyword => 
          event.summary.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (isExcluded) {
          return false;
        }
        
        if (includeKeywords.length === 0) {
          return true;
        }
        
        return includeKeywords.some(keyword => 
          event.summary.toLowerCase().includes(keyword.toLowerCase())
        );
      });
      
      console.log(`Filtered to ${filteredEvents.length} events`);
    }
    
    // Create a new iCal calendar following fiCal's implementation
    const calendar = new ICAL.Component(['vcalendar', [], []]);
    
    // Set required calendar properties - keep minimal like fiCal does
    // fiCal doesn't add many properties, just keeps the original with filtered events
    calendar.updatePropertyWithValue('prodid', '-//iCal Filter//EN');
    calendar.updatePropertyWithValue('version', '2.0');
    
    // Add filtered events to the calendar
    filteredEvents.forEach(event => {
      const vevent = new ICAL.Component('vevent');
      
      // Convert dates to ICAL.Time
      const startDate = ICAL.Time.fromJSDate(new Date(event.startDate), true);
      const endDate = ICAL.Time.fromJSDate(new Date(event.endDate), true);
      
      // Set event properties
      vevent.updatePropertyWithValue('summary', event.summary);
      vevent.updatePropertyWithValue('dtstart', startDate);
      vevent.updatePropertyWithValue('dtend', endDate);
      
      // Generate a unique identifier if none exists
      const uid = event.uid || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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
    
    // Instead of using component.toString(), manually build the iCal content
    // to ensure it strictly follows RFC 5545 format
    let icsContent = 'BEGIN:VCALENDAR\r\n';
    icsContent += 'VERSION:2.0\r\n';
    icsContent += 'PRODID:-//iCal Filter//EN\r\n';
    
    // Add all events
    filteredEvents.forEach(event => {
      icsContent += 'BEGIN:VEVENT\r\n';
      
      // Format dates in iCalendar format
      const formatDate = (date) => {
        return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      };
      
      const startDateStr = formatDate(new Date(event.startDate));
      const endDateStr = formatDate(new Date(event.endDate));
      const nowStr = formatDate(new Date());
      
      icsContent += `UID:${event.uid || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`}\r\n`;
      icsContent += `DTSTAMP:${nowStr}\r\n`;
      icsContent += `DTSTART:${startDateStr}\r\n`;
      icsContent += `DTEND:${endDateStr}\r\n`;
      icsContent += `SUMMARY:${event.summary}\r\n`;
      
      if (event.description) {
        // Escape special characters
        const description = event.description
          .replace(/\\/g, '\\\\')
          .replace(/;/g, '\\;')
          .replace(/,/g, '\\,')
          .replace(/\n/g, '\\n');
        icsContent += `DESCRIPTION:${description}\r\n`;
      }
      
      if (event.location) {
        const location = event.location
          .replace(/\\/g, '\\\\')
          .replace(/;/g, '\\;')
          .replace(/,/g, '\\,');
        icsContent += `LOCATION:${location}\r\n`;
      }
      
      icsContent += 'END:VEVENT\r\n';
    });
    
    icsContent += 'END:VCALENDAR\r\n';
    
    // Set proper Content-Type header for iCalendar
    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');
    // Add cache control headers to ensure fresh content
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Send the manually constructed iCal content
    res.status(200).send(icsContent);
  } catch (error) {
    console.error('Calendar API error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
