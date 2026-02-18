import { usePageTitle } from "@/hooks/use-page-title";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export function PrivacyPolicy() {
  usePageTitle("Privacy Policy");
  const [, setLocation] = useLocation();

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="mb-4" data-testid="button-back-privacy">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>
      <Card>
        <CardContent className="p-8 prose prose-sm dark:prose-invert max-w-none">
          <h1 className="text-2xl font-bold mb-2" data-testid="text-privacy-title">Privacy Policy</h1>
          <p className="text-muted-foreground mb-6">Last updated: February 12, 2026</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">1. Information We Collect</h2>
          <p>When you use CreatorOS, we collect the following information:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Account Information:</strong> Your name, email address, and profile picture provided through your login provider (Google, Discord, TikTok, etc.).</li>
            <li><strong>Platform Data:</strong> When you connect social media platforms, we access your public profile information, content metadata, and analytics as authorized by you.</li>
            <li><strong>Usage Data:</strong> How you interact with CreatorOS, including pages visited, features used, and preferences set.</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-2">2. How We Use Your Information</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>To provide and improve CreatorOS features and services</li>
            <li>To display your content analytics and insights across connected platforms</li>
            <li>To generate AI-powered recommendations and optimizations for your content</li>
            <li>To manage your subscriptions and process payments</li>
            <li>To send you important notifications about your account and connected platforms</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-2">3. Third-Party Services</h2>
          <p>CreatorOS integrates with third-party platforms including but not limited to YouTube, Twitch, Discord, TikTok, X (Twitter), Facebook, Instagram, Threads, LinkedIn, Spotify, and others. When you connect these platforms, their respective privacy policies also apply. We only access data that you explicitly authorize.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">4. Data Storage & Security</h2>
          <p>Your data is stored securely using industry-standard encryption. We use PostgreSQL databases with encrypted connections. OAuth tokens are stored securely and refreshed automatically. We never store your passwords for connected platforms.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">5. Data Sharing</h2>
          <p>We do not sell, rent, or share your personal information with third parties for marketing purposes. We may share data with:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Payment processors (Stripe) to handle subscription billing</li>
            <li>AI service providers (OpenAI) to generate content insights — no personally identifiable information is sent</li>
            <li>Law enforcement if required by law</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-2">6. Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Access and download your data</li>
            <li>Disconnect any connected platform at any time</li>
            <li>Delete your account and all associated data</li>
            <li>Opt out of AI-powered features</li>
            <li>Update or correct your information</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-2">7. Cookies</h2>
          <p>We use essential cookies for authentication and session management. We do not use tracking cookies or third-party advertising cookies.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">8. Children's Privacy</h2>
          <p>CreatorOS is not intended for users under the age of 13. We do not knowingly collect information from children under 13.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">9. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. We will notify you of any significant changes through the app or via email.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">10. Contact Us</h2>
          <p>If you have questions about this Privacy Policy, please contact us at <a href="mailto:support@etgaming247.com" className="text-primary hover:underline" data-testid="link-privacy-contact">support@etgaming247.com</a>.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function TermsOfService() {
  usePageTitle("Terms of Service");
  const [, setLocation] = useLocation();

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="mb-4" data-testid="button-back-tos">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>
      <Card>
        <CardContent className="p-8 prose prose-sm dark:prose-invert max-w-none">
          <h1 className="text-2xl font-bold mb-2" data-testid="text-tos-title">Terms of Service</h1>
          <p className="text-muted-foreground mb-6">Last updated: February 12, 2026</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">1. Acceptance of Terms</h2>
          <p>By accessing or using CreatorOS, you agree to be bound by these Terms of Service. If you do not agree, please do not use the platform.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">2. Description of Service</h2>
          <p>CreatorOS is an AI-powered content management and analytics platform for digital creators. It provides tools for managing content, live streaming, revenue tracking, and growth analytics across multiple social media platforms.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">3. User Accounts</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>You must provide accurate and complete information when creating an account</li>
            <li>You are responsible for maintaining the security of your account</li>
            <li>You must be at least 13 years old to use CreatorOS</li>
            <li>One person may not maintain more than one account</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-2">4. Platform Connections</h2>
          <p>When you connect third-party platforms (YouTube, Twitch, Discord, TikTok, etc.) to CreatorOS:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>You authorize us to access your account data as permitted by each platform's API</li>
            <li>You remain bound by each platform's own terms of service</li>
            <li>You can disconnect any platform at any time</li>
            <li>We are not responsible for changes to third-party platform APIs or policies</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-2">5. Subscriptions & Payments</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Some features require a paid subscription</li>
            <li>Payments are processed securely through Stripe</li>
            <li>Subscriptions auto-renew unless cancelled before the billing date</li>
            <li>Refunds are handled on a case-by-case basis</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-2">6. AI-Generated Content</h2>
          <p>CreatorOS uses AI to provide recommendations, analytics insights, and content suggestions. AI-generated outputs are provided as suggestions only. You are responsible for reviewing and approving any AI-generated content before publishing.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">7. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Use the platform for any illegal or unauthorized purpose</li>
            <li>Attempt to access other users' accounts or data</li>
            <li>Interfere with or disrupt the platform's infrastructure</li>
            <li>Use automated scripts to access the platform beyond the provided API</li>
            <li>Resell or redistribute the service without authorization</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-2">8. Intellectual Property</h2>
          <p>You retain ownership of all content you create and manage through CreatorOS. We do not claim ownership of your content. The CreatorOS platform, its design, code, and AI models are our intellectual property.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">9. Limitation of Liability</h2>
          <p>CreatorOS is provided "as is" without warranties of any kind. We are not liable for any losses resulting from platform downtime, data loss, third-party API changes, or AI-generated content. Our total liability shall not exceed the amount you paid for the service in the past 12 months.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">10. Termination</h2>
          <p>We may suspend or terminate your account if you violate these terms. You may delete your account at any time. Upon termination, your data will be deleted within 30 days.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">11. Changes to Terms</h2>
          <p>We may modify these terms at any time. Continued use of the platform after changes constitutes acceptance of the updated terms.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">12. Contact</h2>
          <p>For questions about these Terms of Service, please contact us at <a href="mailto:support@etgaming247.com" className="text-primary hover:underline" data-testid="link-tos-contact">support@etgaming247.com</a>.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function DataDisclosure() {
  usePageTitle("Data Disclosure");
  const [, setLocation] = useLocation();

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="mb-4" data-testid="button-back-data">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>
      <Card>
        <CardContent className="p-8 prose prose-sm dark:prose-invert max-w-none">
          <h1 className="text-2xl font-bold mb-2" data-testid="text-data-disclosure-title">Data Disclosure Statement</h1>
          <p className="text-muted-foreground mb-6">Last updated: February 18, 2026</p>

          <p>CreatorOS ("we," "us," or "our") is committed to transparency about the data we collect, how we use it, and who we share it with. This Data Disclosure Statement supplements our <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a> and provides detailed information about our data practices in compliance with applicable data protection laws including GDPR, CCPA, and other regulations.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">1. Data We Collect</h2>
          <p>We collect the following categories of personal information:</p>

          <h3 className="text-base font-semibold mt-4 mb-2">A. Information You Provide Directly</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Account Information:</strong> Name, email address, profile picture (from your login provider)</li>
            <li><strong>Business Details:</strong> Business name, entity type, registration number, tax ID, address (if you set up a business profile)</li>
            <li><strong>Content Preferences:</strong> Content niche, streaming preferences, notification settings</li>
            <li><strong>Payment Information:</strong> Processed and stored securely by Stripe — we do not store card numbers or bank details on our servers</li>
            <li><strong>Communications:</strong> Messages sent through our AI chat, feedback, and support requests</li>
          </ul>

          <h3 className="text-base font-semibold mt-4 mb-2">B. Information From Connected Platforms</h3>
          <p>When you connect third-party platforms, we may access:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>YouTube:</strong> Channel info, video metadata, analytics (views, watch time, revenue), comments, subscriber count</li>
            <li><strong>Twitch:</strong> Stream metadata, follower/subscriber counts, chat activity, VOD data</li>
            <li><strong>Discord:</strong> Server info, member counts, channel metadata (we do not read private messages)</li>
            <li><strong>TikTok:</strong> Profile info, video metadata, engagement metrics</li>
            <li><strong>X (Twitter):</strong> Profile info, tweet metadata, engagement metrics</li>
            <li><strong>Kick:</strong> Channel info, stream metadata, follower data</li>
          </ul>

          <h3 className="text-base font-semibold mt-4 mb-2">C. Information Collected Automatically</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Usage Data:</strong> Pages visited, features used, actions taken within CreatorOS</li>
            <li><strong>Device Information:</strong> Browser type, screen size, operating system, performance capabilities (used to optimize the experience for your device)</li>
            <li><strong>Session Data:</strong> Login times, session duration, IP address (for security purposes only)</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-2">2. How We Use Your Data</h2>
          <table className="w-full text-sm border-collapse mt-2">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-semibold">Purpose</th>
                <th className="text-left py-2 font-semibold">Data Used</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4">Provide core services</td>
                <td className="py-2">Account info, platform data, preferences</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4">AI-powered content optimization</td>
                <td className="py-2">Video metadata, analytics, content preferences</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4">Automated content distribution</td>
                <td className="py-2">Platform connections, content metadata</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4">Revenue tracking and reporting</td>
                <td className="py-2">Platform analytics, payment data</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4">Subscription management</td>
                <td className="py-2">Account info, payment info (via Stripe)</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4">Performance optimization</td>
                <td className="py-2">Device info, usage patterns</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4">Security and fraud prevention</td>
                <td className="py-2">Session data, IP address, usage patterns</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Notifications and alerts</td>
                <td className="py-2">Email, notification preferences</td>
              </tr>
            </tbody>
          </table>

          <h2 className="text-lg font-semibold mt-6 mb-2">3. Third-Party Data Sharing</h2>
          <p>We share data with the following categories of third parties, strictly for the purposes described:</p>
          <table className="w-full text-sm border-collapse mt-2">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-semibold">Third Party</th>
                <th className="text-left py-2 pr-4 font-semibold">Data Shared</th>
                <th className="text-left py-2 font-semibold">Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4">OpenAI</td>
                <td className="py-2 pr-4">Content metadata, anonymized analytics</td>
                <td className="py-2">AI-powered content optimization and recommendations</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4">Stripe</td>
                <td className="py-2 pr-4">Email, subscription details</td>
                <td className="py-2">Payment processing and subscription management</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4">Google (Gmail API)</td>
                <td className="py-2 pr-4">Email address</td>
                <td className="py-2">Sending notification and alert emails</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Connected Platforms</td>
                <td className="py-2 pr-4">Content updates, metadata</td>
                <td className="py-2">Publishing and optimizing content on your behalf</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2"><strong>We do not sell your personal data to any third party.</strong></p>

          <h2 className="text-lg font-semibold mt-6 mb-2">4. Data Retention</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Account Data:</strong> Retained while your account is active. Deleted within 30 days of account deletion.</li>
            <li><strong>Analytics Data:</strong> Retained for up to 24 months to provide trend analysis and historical insights.</li>
            <li><strong>Platform Tokens:</strong> OAuth tokens are refreshed automatically and revoked immediately upon platform disconnection.</li>
            <li><strong>AI Interaction Logs:</strong> Retained for up to 90 days for service improvement, then anonymized or deleted.</li>
            <li><strong>Payment Records:</strong> Retained as required by applicable tax and financial regulations (typically 7 years).</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-2">5. Your Rights</h2>
          <p>Depending on your location, you may have the following rights regarding your personal data:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Right to Access:</strong> Request a copy of all personal data we hold about you</li>
            <li><strong>Right to Rectification:</strong> Correct inaccurate or incomplete data</li>
            <li><strong>Right to Erasure:</strong> Request deletion of your personal data ("right to be forgotten")</li>
            <li><strong>Right to Portability:</strong> Receive your data in a structured, machine-readable format</li>
            <li><strong>Right to Object:</strong> Object to processing of your data for specific purposes</li>
            <li><strong>Right to Restrict Processing:</strong> Limit how we use your data</li>
            <li><strong>Right to Withdraw Consent:</strong> Withdraw consent at any time where processing is based on consent</li>
            <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising your rights (CCPA)</li>
          </ul>
          <p className="mt-2">To exercise any of these rights, contact us at <a href="mailto:support@etgaming247.com" className="text-primary hover:underline" data-testid="link-data-rights-contact">support@etgaming247.com</a>. We will respond within 30 days.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">6. Data Security Measures</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>All data transmitted over HTTPS with TLS encryption</li>
            <li>Database encryption at rest using industry-standard AES-256</li>
            <li>OAuth 2.0 with automatic token refresh for platform connections</li>
            <li>Rate limiting and bot protection on all API endpoints</li>
            <li>AI-powered security sentinel for continuous threat monitoring</li>
            <li>Regular security audits and vulnerability assessments</li>
            <li>CSRF protection, parameter pollution prevention, and input validation</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-2">7. International Data Transfers</h2>
          <p>Your data may be processed in countries outside your jurisdiction. We ensure appropriate safeguards are in place, including standard contractual clauses and compliance with applicable data transfer frameworks.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">8. Children's Data</h2>
          <p>CreatorOS is not intended for individuals under the age of 13 (or 16 in the EEA). We do not knowingly collect personal data from children. If we become aware that we have collected data from a child, we will take steps to delete it promptly.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">9. California Residents (CCPA)</h2>
          <p>If you are a California resident, you have additional rights under the California Consumer Privacy Act:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Right to know what personal information is collected, used, and shared</li>
            <li>Right to delete personal information</li>
            <li>Right to opt out of the sale of personal information (we do not sell your data)</li>
            <li>Right to non-discrimination for exercising CCPA rights</li>
          </ul>

          <h2 className="text-lg font-semibold mt-6 mb-2">10. EU/EEA Residents (GDPR)</h2>
          <p>If you are in the EU/EEA, our legal bases for processing your data include:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Contract:</strong> Processing necessary to provide our services to you</li>
            <li><strong>Consent:</strong> Where you have given explicit consent (e.g., connecting platforms)</li>
            <li><strong>Legitimate Interest:</strong> For security, fraud prevention, and service improvement</li>
            <li><strong>Legal Obligation:</strong> Where required by law (e.g., financial records)</li>
          </ul>
          <p className="mt-2">Our Data Protection contact can be reached at <a href="mailto:support@etgaming247.com" className="text-primary hover:underline" data-testid="link-data-dpo-contact">support@etgaming247.com</a>.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">11. Updates to This Disclosure</h2>
          <p>We may update this Data Disclosure Statement periodically. Material changes will be communicated through the app and/or via email to your registered address. Continued use of CreatorOS after updates constitutes acceptance of the revised disclosure.</p>

          <h2 className="text-lg font-semibold mt-6 mb-2">12. Contact</h2>
          <p>For questions, concerns, or to exercise your data rights, contact us at <a href="mailto:support@etgaming247.com" className="text-primary hover:underline" data-testid="link-data-contact">support@etgaming247.com</a>.</p>
        </CardContent>
      </Card>
    </div>
  );
}
