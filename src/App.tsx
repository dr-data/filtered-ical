import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { Calendar, Download, Copy, Filter } from 'lucide-react';
import { fetchAndParseICal, type ICalEvent, downloadICS, generateICS } from './lib/icalUtils';
import { fuzzySearch } from './lib/fuzzySearch';
import { BrowserRouter, Routes, Route, useSearchParams, useLocation, useParams } from 'react-router-dom';

const DEFAULT_CALENDAR_URL = '/api/zetlandhall';

const CAPITAL_ACRONYMS = [
  'EC', 'IC', 'SC', 'MMM', 'RX', 'OSM', 'DGL', 'DGRACFE', 'AGM', 'RAC',
  'ZH HK', 'FEMAC', 'HKFEMBFC', 'DGC HK&FE'
];

const LOWERCASE_WORDS = ['service'];

// New component to handle filtered calendar requests
function FilteredCalendar() {
  const [searchParams] = useSearchParams();
  const url = searchParams.get('url');
  const keywords = searchParams.get('keywords');
  const [calendarContent, setCalendarContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchAndFilterCalendar = async () => {
      if (!url) {
        setError('No calendar URL provided');
        return;
      }

      try {
        const events = await fetchAndParseICal(url);
        
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
        
        // Generate iCal content
        const icsContent = generateICS(filteredEvents);
        setCalendarContent(icsContent);
        
        // Set content type to text/calendar
        document.getElementsByTagName('html')[0].setAttribute('content-type', 'text/calendar');
        
      } catch (e) {
        setError(`Failed to fetch calendar: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    };

    fetchAndFilterCalendar();
  }, [url, keywords]);

  // If we have calendar content, display it as plain text
  if (calendarContent) {
    return (
      <pre style={{ 
        whiteSpace: 'pre-wrap', 
        display: 'block', 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        margin: 0, 
        padding: 0 
      }}>
        {calendarContent}
      </pre>
    );
  }

  // If there's an error or we're still loading, show a minimal UI
  return (
    <div style={{ display: 'none' }}>
      {error ? `Error: ${error}` : 'Loading calendar...'}
    </div>
  );
}

// New component to handle subscription calendar requests with path parameters
function SubscriptionCalendar() {
  const { encodedUrl, encodedKeywords } = useParams<{ 
    encodedUrl: string, 
    encodedKeywords?: string 
  }>();

  useEffect(() => {
    // Redirect to our API endpoint that serves calendar data
    // Include keywords if present
    let subscriptionUrl = `/api/filtered/${encodedUrl}`;
    if (encodedKeywords) {
      subscriptionUrl += `/${encodedKeywords}`;
    }

    // Use replace to avoid adding to browser history
    window.location.replace(subscriptionUrl);
  }, [encodedUrl, encodedKeywords]);

  // Empty component during redirect
  return null;
}

function App() {
  // Use location to determine if we're on the main page or filtered calendar page
  const location = useLocation();
  const isFilteredCalendarRoute = location.pathname === '/calendar/filtered';
  
  // If we're on the filtered calendar route, render the FilteredCalendar component
  if (isFilteredCalendarRoute) {
    return <FilteredCalendar />;
  }
  
  // Original App component code for the main interface
  const [calendarUrl, setCalendarUrl] = useState(DEFAULT_CALENDAR_URL);
  const [keywords, setKeywords] = useState('');
  const [events, setEvents] = useState<ICalEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<ICalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentKeyword, setCurrentKeyword] = useState('');
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      if (!calendarUrl) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const fetchedEvents = await fetchAndParseICal(calendarUrl);
        setEvents(fetchedEvents);
      } catch (e) {
        setError('Failed to fetch calendar events. Please check the URL and try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [calendarUrl]);

  useEffect(() => {
    const keywordList = keywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (keywordList.length === 0) {
      setFilteredEvents(events);
      return;
    }

    const includeKeywords = keywordList.filter(k => !k.startsWith('!'));
    const excludeKeywords = keywordList
      .filter(k => k.startsWith('!'))
      .map(k => k.substring(1).trim());

    const filtered = events.filter(event => {
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

    setFilteredEvents(filtered);
  }, [events, keywords]);

  const normalizeSummary = (summary: string): string => {
    return summary
      .replace(/\s*\(\d+\/\d+\)|\s*\d+\/\d+/g, '')
      .trim()
      .toLowerCase();
  };

  const formatWithAcronyms = (str: string): string => {
    let result = str.toLowerCase().split(' ').map(word => {
      const matchingAcronym = CAPITAL_ACRONYMS.find(acronym => 
        acronym.toLowerCase() === word ||
        acronym.toLowerCase().split(' ').join('') === word
      );
      
      if (matchingAcronym) {
        return matchingAcronym;
      }

      if (LOWERCASE_WORDS.includes(word.toLowerCase())) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');

    CAPITAL_ACRONYMS.forEach(acronym => {
      const regex = new RegExp(acronym.toLowerCase(), 'gi');
      result = result.replace(regex, acronym);
    });

    return result;
  };

  const updateSuggestions = (input: string) => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }

    const searchTerm = input.startsWith('!') ? input.substring(1).trim() : input;

    const uniqueSummariesMap = new Map<string, string>();
    events.forEach(event => {
      const normalizedSummary = normalizeSummary(event.summary);
      const formattedSummary = formatWithAcronyms(normalizedSummary);
      uniqueSummariesMap.set(normalizedSummary, formattedSummary);
    });

    const matchingSuggestions = Array.from(uniqueSummariesMap.values())
      .filter(summary => summary.toLowerCase().includes(searchTerm.toLowerCase()))
      .slice(0, 5)
      .map(suggestion => input.startsWith('!') ? `!${suggestion}` : suggestion);

    setSuggestions(matchingSuggestions);
    setSelectedSuggestionIndex(-1);
  };

  const handleKeywordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setKeywords(value);
    
    const currentWord = value.split(',').pop()?.trim() || '';
    setCurrentKeyword(currentWord);
    
    if (currentWord) {
      updateSuggestions(currentWord);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          handleSuggestionClick(suggestions[selectedSuggestionIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    const keywordArray = keywords.split(',').map(k => k.trim());
    keywordArray.pop();
    keywordArray.push(suggestion);
    setKeywords(keywordArray.join(', '));
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    inputRef.current?.focus();
  };

  // Function to convert base64 to base64url format (URL-safe)
  const base64ToBase64url = (input: string): string => {
    // Replace non-url compatible chars with base64url standard chars and remove padding
    return input
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  };

  const getSubscriptionUrl = () => {ist
    if (!calendarUrl) return '';let encodedKeywords = '';
    
    try {
      // Encode the URL as base64url
      const encodedUrl = base64ToBase64url(btoa(calendarUrl));
      const encodedKeywords = keywords ? base64ToBase64url(btoa(keywords)) : ''; = window.location.host;
       
      const host = window.location.host;  // Use the subscription format with webcal:// protocol
            // Include encoded keywords if present
      // Use the subscription format with webcal:// protocol and direct path
      return encodedKeywordsndar/${encodedUrl}/${encodedKeywords}/filtered.ics`;
        ? `webcal://${host}/calendar/${encodedUrl}/${encodedKeywords}/filtered.ics`
        : `webcal://${host}/calendar/${encodedUrl}/filtered.ics`;        return `webcal://${host}/calendar/${encodedUrl}/filtered.ics`;
    } catch (error) {
      console.error('Error encoding subscription URL:', error);
      return '';rror encoding subscription URL:', error);
    }
  };

  const handleCopy = async () => {
    const url = getSubscriptionUrl();nst handleCopy = async () => {
    if (!url) return;    const url = getSubscriptionUrl();

    try {
      await navigator.clipboard.writeText(url);try {
      setCopied(true);      await navigator.clipboard.writeText(url);
      setTimeout(() => setCopied(false), 2000);opied(true);
    } catch (err) {);
      console.error('Failed to copy URL:', err);
    }err);
  };

  const handleDownload = () => {
    downloadICS(filteredEvents);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">ray-50">
        <div className="text-center mb-12">ame="max-w-4xl mx-auto px-4 py-12">
          <div className="flex items-center justify-center mb-4">
            <Calendar className="w-12 h-12 text-blue-600" />ex items-center justify-center mb-4">
          </div>className="w-12 h-12 text-blue-600" />
          <h1 className="text-4xl font-bold text-gray-900 mb-4">iCal Filter</h1>
          <p className="text-xl text-gray-600">Filter your calendar events using keywords</p>ext-4xl font-bold text-gray-900 mb-4">iCal Filter</h1>
        </div>text-gray-600">Filter your calendar events using keywords</p>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <div className="space-y-6">
            <div>
              <label htmlFor="calendarUrl" className="block text-sm font-medium text-gray-700 mb-2">>
                Calendar URLel htmlFor="calendarUrl" className="block text-sm font-medium text-gray-700 mb-2">
              </label>                Calendar URL
              <input
                type="url"
                id="calendarUrl"
                value={calendarUrl}lendarUrl"
                onChange={(e) => setCalendarUrl(e.target.value)}e={calendarUrl}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"=> setCalendarUrl(e.target.value)}
                placeholder="Enter iCal URL..."w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />Enter iCal URL..."
            </div>

            <div className="relative">
              <label htmlFor="keywords" className="block text-sm font-medium text-gray-700 mb-2">
                Filter Keywords
              </label>
              <inputlabel>
                ref={inputRef}
                type="text"
                id="keywords"
                value={keywords}s"
                onChange={handleKeywordChange}
                onKeyDown={handleKeyDown}
                onFocus={() => currentKeyword && setShowSuggestions(true)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"wSuggestions(true)}
                placeholder="Enter keywords separated by commas (use ! to exclude)..." border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />er="Enter keywords separated by commas (use ! to exclude)..."
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
                  {suggestions.map((suggestion, index) => (className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
                    <button((suggestion, index) => (
                      key={index}
                      className={`w-full px-4 py-2 text-left hover:bg-blue-50 focus:outline-none ${ key={index}
                        index === selectedSuggestionIndex className={`w-full px-4 py-2 text-left hover:bg-blue-50 focus:outline-none ${
                          ? 'bg-blue-100 text-blue-900'        index === selectedSuggestionIndex 
                          : 'text-gray-900'
                      }`}
                      onClick={() => handleSuggestionClick(suggestion)}    }`}
                      onMouseEnter={() => setSelectedSuggestionIndex(index)}    onClick={() => handleSuggestionClick(suggestion)}
                    >                      onMouseEnter={() => setSelectedSuggestionIndex(index)}
                      {suggestion}
                    </button>
                  ))}utton>
                </div>}
              )}  </div>
              <p className="mt-2 text-sm text-gray-500">              )}
                Separate multiple keywords with commas. Use ! to exclude (e.g., "!meeting")0">
              </p>ate multiple keywords with commas. Use ! to exclude (e.g., "!meeting")
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-700">ror && (
                {error}-red-200 rounded-md p-4 text-red-700">
              </div>
            )}
            )}
            <div className="flex flex-col space-y-4">
              <button
                onClick={handleDownload}
                disabled={loading || filteredEvents.length === 0}{handleDownload}
                className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"ed={loading || filteredEvents.length === 0}
              >ex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                <Download className="w-5 h-5 mr-2" />
                Download Filtered CalendarclassName="w-5 h-5 mr-2" />
              </button>
tton>
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">">
                  Subscription URLext-sm font-medium text-gray-700 mb-2">
                </label>
                <input/label>
                  type="text"
                  value={getSubscriptionUrl()}
                  readOnly={getSubscriptionUrl()}
                  className="w-full px-4 py-2 pr-24 border border-gray-300 rounded-md bg-gray-50"Only
                />der border-gray-300 rounded-md bg-gray-50"
                <button
                  onClick={handleCopy}
                  disabled={!calendarUrl}Click={handleCopy}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"d={!calendarUrl}
                >assName="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  {copied ? (
                    <span className="text-green-600">Copied!</span>  {copied ? (
                  ) : (      <span className="text-green-600">Copied!</span>
                    <>                  ) : (
                      <Copy className="w-4 h-4 mr-1" />
                      Copy1" />
                    </>
                  )}
                </button>
              </div>
            </div>>
          </div>v>
        </div>          </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center mb-4">assName="bg-white rounded-lg shadow-lg p-6">
            <Filter className="w-5 h-5 text-blue-600 mr-2" />nter mb-4">
            <h2 className="text-lg font-semibold">Filtered Events</h2>mr-2" />
            <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
              {filteredEvents.length} eventsunded-full">
            </span>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading events...</div>
          ) : (me="text-center py-8 text-gray-500">Loading events...</div>
            <div className="space-y-4">
              {filteredEvents.map((event, index) => (className="space-y-4">
                <div key={index} className="border border-gray-200 rounded-md p-4">
                  <h3 className="font-medium text-gray-900">{event.summary}</h3>00 rounded-md p-4">
                  <div className="mt-2 text-sm text-gray-500">-900">{event.summary}</h3>
                    <p> className="mt-2 text-sm text-gray-500">
                      {new Date(event.startDate).toLocaleString()} - {new Date(event.endDate).toLocaleString()}    <p>
                    </p>    {new Date(event.startDate).toLocaleString()} - {new Date(event.endDate).toLocaleString()}
                    {event.location && <p className="mt-1">{event.location}</p>}        </p>
                  </div>      {event.location && <p className="mt-1">{event.location}</p>}
                </div>      </div>
              ))}      </div>
              {filteredEvents.length === 0 && !loading && (          ))}
                <div className="text-center py-8 text-gray-500">             {filteredEvents.length === 0 && !loading && (
                  No events match your filter criteria                <div className="text-center py-8 text-gray-500">
                </div>lter criteria
              )}
            </div>
          )}</div>
        </div>
      </div>
    </div>
  );
}

// Wrap the App export with BrowserRouter
const AppWithRouter = () => (rowserRouter











export default AppWithRouter;);  </BrowserRouter>    </Routes>      <Route path="/calendar/:encodedUrl/:encodedKeywords/filtered.ics" element={<SubscriptionCalendar />} />      <Route path="/calendar/:encodedUrl/filtered.ics" element={<SubscriptionCalendar />} />      <Route path="/calendar/filtered" element={<FilteredCalendar />} />      <Route path="/" element={<App />} />    <Routes>  <BrowserRouter>const AppWithRouter = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/calendar/filtered" element={<FilteredCalendar />} />
      <Route path="/calendar/:encodedUrl/filtered.ics" element={<SubscriptionCalendar />} />
    </Routes>
  </BrowserRouter>
);

export default AppWithRouter;