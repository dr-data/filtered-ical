# Webcal Connection Diagnostic

This project helps diagnose issues with webcal calendar subscription URLs.

## How to Use

1. Make sure Node.js is installed on your system
2. Run the diagnostic script:
   ```
   node webcal-diagnostic.js
   ```
3. Review the output for potential issues and solutions

## Common Webcal Issues and Solutions

### Server Not Running
- Ensure your local server is running on port 5174
- Check server logs for any startup errors
- Verify that the application is correctly configured to serve .ics files

### Authentication Issues
- Some calendar endpoints require authentication
- Check if you need to include credentials in the URL or set up API keys

### Invalid Calendar Format
- Ensure the server is producing valid iCalendar (.ics) format
- Validate the output using an iCalendar validator

### Calendar Application Support
- Not all calendar applications support webcal protocol
- Try using the equivalent http:// URL in your calendar application
- Example: Replace `webcal://localhost:5174/...` with `http://localhost:5174/...`

### Port Access
- Make sure port 5174 isn't blocked by a firewall
- Try accessing the endpoint directly in a browser with http://localhost:5174/calendar/L2FwaS96ZXRsYW5kaGFsbA/cm90YXJpYW4/filtered.ics

## Direct Troubleshooting

You can also try accessing the .ics file directly in your browser by navigating to:
```
http://localhost:5174/calendar/L2FwaS96ZXRsYW5kaGFsbA/cm90YXJpYW4/filtered.ics
```

If this works, but the webcal protocol doesn't, the issue may be with your calendar application's handling of the webcal protocol.
