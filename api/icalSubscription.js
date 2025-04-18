import { fetchAndParseICal } from '../src/lib/icalUtils';

export default async function handler(req, res) {
  // Get the encoded URL from path parameters
  const { encodedUrl } = req.query;
  
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
    
    if (!calendarUrl) {
      return res.status(400).json({ error: 'Invalid URL encoding' });
    }
    
    console.log('Fetching calendar from:', calendarUrl);
    
    // Fetch and parse calendar
    const events = await fetchAndParseICal(calendarUrl);
    
    console.log(`Fetched ${events.length} events`);
    
    // Generate iCalendar content
    const icsContent = generateICS(events);
    
    // Set proper headers for iCalendar content
    res.setHeader('Content-Type', 'text/calendar'); // Simplified MIME type
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
  let icsContent = 'BEGIN:VCALENDAR\r\n';
  icsContent += 'VERSION:2.0\r\n';
  icsContent += 'PRODID:-//iCal Filter//EN\r\n';
  icsContent += 'CALSCALE:GREGORIAN\r\n';
  icsContent += 'METHOD:PUBLISH\r\n';

  events.forEach(event => {
    icsContent += 'BEGIN:VEVENT\r\n';

    // Format date strings to iCalendar format (YYYYMMDDTHHMMSS)
    const formatDate = (date) => {
      return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, '');
    };

    const startDate = new Date(event.startDate);
    const endDate = new Date(event.endDate);

    icsContent += `SUMMARY:${escapeText(event.summary)}\r\n`;
    icsContent += `DTSTART:${formatDate(startDate)}\r\n`;
    icsContent += `DTEND:${formatDate(endDate)}\r\n`;
    icsContent += `UID:${event.uid || generateUID()}\r\n`;
    icsContent += `DTSTAMP:${formatDate(new Date())}\r\n`; // Use current date/time for DTSTAMP

    if (event.description) {
      icsContent += `DESCRIPTION:${escapeText(event.description)}\r\n`;
    }

    if (event.location) {
      icsContent += `LOCATION:${escapeText(event.location)}\r\n`;
    }

    icsContent += 'END:VEVENT\r\n';
  });

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
