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
