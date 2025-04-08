import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import ICAL from 'ical.js'
import { fetchAndParseICal } from './src/lib/icalUtils'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    middleware: [
      async (req, res, next) => {
        // Handle calendar filtered endpoint
        if (req.url?.startsWith('/calendar/filtered')) {
          try {
            // Parse URL parameters
            const url = new URL(req.url, `http://${req.headers.host}`);
            const calendarUrl = url.searchParams.get('url');
            const keywords = url.searchParams.get('keywords');
            
            if (!calendarUrl) {
              res.statusCode = 400;
              res.end('Error: No calendar URL provided');
              return;
            }
            
            // Fetch calendar data
            const events = await fetchAndParseICal(calendarUrl);
            
            // Apply keyword filtering if provided
            let filteredEvents = events;
            if (keywords) {
              const keywordList = keywords
                .split(',')
                .map(k => k.trim())
                .filter(k => k.length > 0);
              
              if (keywordList.length > 0) {
                const includeKeywords = keywordList.filter(k => !k.startsWith('!'));
                const excludeKeywords = keywordList
                  .filter(k => k.startsWith('!'))
                  .map(k => k.substring(1).trim());
                
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
              }
            }
            
            // Create a new iCal calendar component
            const calendar = new ICAL.Component(['vcalendar', [], []]);
            
            // Set required calendar properties
            calendar.updatePropertyWithValue('prodid', '-//iCal Filter//EN');
            calendar.updatePropertyWithValue('version', '2.0');
            calendar.updatePropertyWithValue('calscale', 'GREGORIAN');
            calendar.updatePropertyWithValue('method', 'PUBLISH');
            calendar.updatePropertyWithValue('x-wr-calname', 'Filtered Calendar');
            calendar.updatePropertyWithValue('x-wr-caldesc', `Calendar filtered with keywords: ${keywords || 'none'}`);
            calendar.updatePropertyWithValue('x-wr-timezone', 'UTC');
            
            // Add events to the calendar
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
            
            // Generate iCal content
            const icsContent = calendar.toString();
            
            // Ensure the iCal content starts with BEGIN:VCALENDAR and ends with END:VCALENDAR
            const finalContent = icsContent.startsWith('BEGIN:VCALENDAR') 
              ? icsContent 
              : `BEGIN:VCALENDAR\r\n${icsContent}END:VCALENDAR\r\n`;
            
            // Log the first and last parts of the content for debugging
            console.log('Generated iCal content (first 200 chars):', finalContent.substring(0, 200));
            console.log('Generated iCal content (last 200 chars):', finalContent.substring(finalContent.length - 200));
            
            // Set appropriate headers for iCal content
            res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
            res.setHeader('Content-Disposition', 'inline; filename=filtered-calendar.ics');
            // Add cache control headers to prevent caching
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            
            // Send the iCal content
            res.end(finalContent);
            console.log('Calendar response sent successfully');
            return;
          } catch (error) {
            console.error('Calendar filtering error:', error);
            res.statusCode = 500;
            res.end(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return;
          }
        }
        
        // Handle calendar filtered endpoint with base64 encoded parameters
        // Format: /calendar/{base64_url}/{base64_keywords}/filtered.ics
        const calendarPathRegex = /^\/calendar\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/filtered\.ics$/;
        const match = req.url?.match(calendarPathRegex);
        
        if (match) {
          console.log('Calendar request matched:', req.url);
          try {
            // Decode base64url parameters
            const b64url = match[1];
            const b64keywords = match[2];
            
            // Convert base64url to regular base64 by replacing characters and adding padding
            const base64url = (str) => {
              let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
              while (base64.length % 4) {
                base64 += '=';
              }
              return base64;
            };
            
            // Decode the URL and keywords
            let calendarUrl, keywords;
            try {
              calendarUrl = atob(base64url(b64url));
              keywords = atob(base64url(b64keywords)).split(',');
              console.log('Decoded URL:', calendarUrl);
              console.log('Decoded Keywords:', keywords);
            } catch (e) {
              console.error('Base64 decoding error:', e);
              res.statusCode = 400;
              res.end('Error: Invalid base64 data');
              return;
            }
            
            if (!calendarUrl) {
              res.statusCode = 400;
              res.end('Error: No calendar URL provided');
              return;
            }
            
            // Fetch calendar data
            console.log('Fetching calendar from URL:', calendarUrl);
            const events = await fetchAndParseICal(calendarUrl);
            console.log(`Fetched ${events.length} events from calendar`);
            
            // Apply keyword filtering
            let filteredEvents = events;
            if (keywords && keywords.length > 0) {
              // Process keywords to handle exclusions (!)
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
            
            // Create a new iCal calendar component
            const calendar = new ICAL.Component(['vcalendar', [], []]);
            
            // Set required calendar properties
            calendar.updatePropertyWithValue('prodid', '-//iCal Filter//EN');
            calendar.updatePropertyWithValue('version', '2.0');
            calendar.updatePropertyWithValue('calscale', 'GREGORIAN');
            calendar.updatePropertyWithValue('method', 'PUBLISH');
            calendar.updatePropertyWithValue('x-wr-calname', 'Filtered Calendar');
            calendar.updatePropertyWithValue('x-wr-caldesc', `Calendar filtered with keywords: ${keywords.join(', ')}`);
            calendar.updatePropertyWithValue('x-wr-timezone', 'UTC');
            
            // Add events to the calendar
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
            
            // Generate iCal content
            const icsContent = calendar.toString();
            
            // Ensure the iCal content starts with BEGIN:VCALENDAR and ends with END:VCALENDAR
            const finalContent = icsContent.startsWith('BEGIN:VCALENDAR') 
              ? icsContent 
              : `BEGIN:VCALENDAR\r\n${icsContent}END:VCALENDAR\r\n`;
            
            // Log the first and last parts of the content for debugging
            console.log('Generated iCal content (first 200 chars):', finalContent.substring(0, 200));
            console.log('Generated iCal content (last 200 chars):', finalContent.substring(finalContent.length - 200));
            
            // Set appropriate headers for iCal content
            res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
            res.setHeader('Content-Disposition', 'inline; filename=filtered-calendar.ics');
            // Add cache control headers to prevent caching
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            
            // Send the iCal content
            res.end(finalContent);
            console.log('Calendar response sent successfully');
            return;
          } catch (error) {
            console.error('Calendar filtering error:', error);
            res.statusCode = 500;
            res.end(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return;
          }
        }
        
        // Continue to next middleware if not handling calendar endpoint
        next();
      }
    ],
    proxy: {
      '/api': {
        target: 'http://tockify.com',
        changeOrigin: true,
        rewrite: (path) => {
          // Handle different API path formats
          if (path.startsWith('/api/feeds/ics/')) {
            // If the path already has the full format, keep it as is
            return path;
          } else {
            // Convert /api/{calendar} to /api/feeds/ics/{calendar}
            return path.replace(/^\/api\/(.*)/, '/api/feeds/ics/$1');
          }
        },
      }
    }
  }
})