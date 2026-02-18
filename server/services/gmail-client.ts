// Gmail integration via Replit Connectors
import { google } from 'googleapis';
import { SUPPORT_EMAIL } from "@shared/models/auth";

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function createRawEmail(to: string, subject: string, htmlBody: string): string {
  const boundary = "boundary_" + Date.now();
  const lines = [
    `From: CreatorOS <${SUPPORT_EMAIL}>`,
    `Reply-To: ${SUPPORT_EMAIL}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    htmlBody,
    ``,
    `--${boundary}--`,
  ];
  const raw = lines.join("\r\n");
  return Buffer.from(raw).toString("base64url");
}

export async function sendGmail(to: string, subject: string, htmlBody: string): Promise<boolean> {
  try {
    const gmail = await getUncachableGmailClient();
    const raw = createRawEmail(to, subject, htmlBody);
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    console.log(`[Gmail] Sent: "${subject}" -> ${to}`);
    return true;
  } catch (err: any) {
    console.error(`[Gmail] Failed to send: ${err.message}`);
    return false;
  }
}
