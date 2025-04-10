import { fetchAndParseICal } from '../src/lib/icalUtils';

export default async function handler(req, res) {
  // Get the encoded URL and keywords from path parameters
  const { encodedUrl, encodedKeywords } = req.query;
  
  if (!encodedUrl) {
    return res.status(400).json({ error: 'Missing encoded URL parameter' });
  }
  
  try {
    // Base64 decoding function (URL-safe)
    const base64Decode = (str) => {
      try {
        const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        const paddedBase64 = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
        return Buffer.from(paddedBase64, 'base64').toString();
      } catch (err) {
        console.error('Base64 decoding error:', err);
        return null;
      }
    };
    
    // Decode parameters
    const calendarUrl = base64Decode(encodedUrl);
    const keywords = encodedKeywords ? base64Decode(encodedKeywords).split(',') : [];
    
    if (!calendarUrl) {
      return res.status(400).json({ error: 'Invalid URL encoding' });
    }
    
    console.log('Fetching calendar from:', calendarUrl);
    console.log('Filtering with keywords:', keywords);
    
    // Fetch and parse calendar
    const events = await fetchAndParseICal(calendarUrl);
    
    // Filter events based on keywords
    let filteredEvents = events;
    if (keywords && keywords.length > 0) {
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
    
    // Generate iCalendar content
    const icsContent = generateICS(filteredEvents);
    
    // Set proper headers for iCalendar content
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="calendar.ics"');
    // Ensure no caching to get fresh content
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Return the iCalendar content
    return res.status(200).send(icsContent);
  } catch (err) {
    console.error('Error processing calendar:', err);
    return res.status(500).json({ error: 'Error processing calendar subscription' });
  }
}

// Function to generate proper iCalendar content
function generateICS(events) {
  // Start with required iCalendar headers
  let icsContent = 'BEGIN:VCALENDAR\r\n';
  icsContent += 'VERSION:2.0\r\n';
  icsContent += 'PRODID:-//iCal Filter//EN\r\n';
  icsContent += 'CALSCALE:GREGORIAN\r\n';
  icsContent += 'METHOD:PUBLISH\r\n';
  
  // Add each event
  events.forEach(event => {
    icsContent += 'BEGIN:VEVENT\r\n';
    
    // Format proper date strings
    const formatDate = (date) => {
      return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    };
    
    const startDate = new Date(event.startDate);
    const endDate = new Date(event.endDate);
    
    // Add core properties
    icsContent += `SUMMARY:${escapeText(event.summary)}\r\n`;
    icsContent += `DTSTART:${formatDate(startDate)}\r\n`;
    icsContent += `DTEND:${formatDate(endDate)}\r\n`;
    icsContent += `UID:${event.uid || generateUID()}\r\n`;
    icsContent += `DTSTAMP:${formatDate(new Date())}\r\n`;
    
    // Add optional properties
    if (event.description) {
      icsContent += `DESCRIPTION:${escapeText(event.description)}\r\n`;
    }
    
    if (event.location) {
      icsContent += `LOCATION:${escapeText(event.location)}\r\n`;
    }
    
    icsContent += 'END:VEVENT\r\n';
  });
  
  // Close the calendar
  icsContent += 'END:VCALENDAR\r\n';
  
  return icsContent;
}

// Helper functions
function escapeText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function generateUID() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
