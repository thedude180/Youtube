export function wrapEmailTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f23;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f23;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:12px;overflow:hidden;">
<tr><td style="padding:30px 40px;background:linear-gradient(135deg,#6366f1,#8b5cf6);text-align:center;">
<h1 style="color:#fff;margin:0;font-size:24px;">CreatorOS</h1>
<p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">${title}</p>
</td></tr>
<tr><td style="padding:30px 40px;color:#e2e8f0;font-size:15px;line-height:1.6;">
${body}
</td></tr>
<tr><td style="padding:20px 40px;border-top:1px solid #2d2d4e;text-align:center;">
<p style="color:#64748b;font-size:12px;margin:0;">CreatorOS - Your AI-Powered Content Engine</p>
<p style="color:#475569;font-size:11px;margin:8px 0 0;"><a href="https://etgaming247.com" style="color:#6366f1;text-decoration:none;">etgaming247.com</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function reconnectAlertEmail(username: string, platform: string, reconnectUrl: string): string {
  return wrapEmailTemplate("Platform Reconnection Required", `
    <p>Hi ${username},</p>
    <p>Your <strong>${platform}</strong> connection has expired and needs to be reconnected.</p>
    <p>CreatorOS temporarily paused posting to ${platform} to prevent errors.</p>
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td>
    <a href="${reconnectUrl}" style="background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Reconnect ${platform}</a>
    </td></tr></table>
    <p style="color:#94a3b8;font-size:13px;">Once reconnected, all automated posting will resume automatically.</p>
  `);
}

export function weeklyReportEmail(username: string, stats: { videosCreated: number; optimizations: number; posts: number; healthScore: number }): string {
  return wrapEmailTemplate("Weekly Performance Report", `
    <p>Hi ${username},</p>
    <p>Here's your CreatorOS weekly summary:</p>
    <table width="100%" cellpadding="12" cellspacing="0" style="margin:16px 0;">
    <tr><td style="background:#1e1e3a;border-radius:8px;text-align:center;width:25%;">
      <div style="font-size:28px;font-weight:700;color:#6366f1;">${stats.videosCreated}</div>
      <div style="font-size:12px;color:#94a3b8;">Videos</div>
    </td><td style="background:#1e1e3a;border-radius:8px;text-align:center;width:25%;">
      <div style="font-size:28px;font-weight:700;color:#8b5cf6;">${stats.optimizations}</div>
      <div style="font-size:12px;color:#94a3b8;">Optimizations</div>
    </td><td style="background:#1e1e3a;border-radius:8px;text-align:center;width:25%;">
      <div style="font-size:28px;font-weight:700;color:#a78bfa;">${stats.posts}</div>
      <div style="font-size:12px;color:#94a3b8;">Posts</div>
    </td><td style="background:#1e1e3a;border-radius:8px;text-align:center;width:25%;">
      <div style="font-size:28px;font-weight:700;color:#c084fc;">${stats.healthScore}%</div>
      <div style="font-size:12px;color:#94a3b8;">Health</div>
    </td></tr>
    </table>
    <p style="color:#94a3b8;font-size:13px;">CreatorOS is working 24/7 to grow your channel.</p>
  `);
}

export function welcomeEmail(username: string): string {
  return wrapEmailTemplate("Welcome to CreatorOS!", `
    <p>Hi ${username},</p>
    <p>Welcome to <strong>CreatorOS</strong> — your AI-powered content management system.</p>
    <p>Here's what happens next:</p>
    <ul style="padding-left:20px;">
      <li>Connect your platforms (YouTube, Twitch, Kick, TikTok, X, Discord)</li>
      <li>Our AI starts monitoring and optimizing your content automatically</li>
      <li>Sit back while CreatorOS handles SEO, cross-posting, and growth</li>
    </ul>
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td>
    <a href="https://etgaming247.com/settings" style="background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Get Started</a>
    </td></tr></table>
  `);
}
