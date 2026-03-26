import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, AlertTriangle, Clock, Lock, Database } from "lucide-react";
import { Link } from "wouter";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/login">
            <Button variant="ghost" size="icon" data-testid="button-back" className="text-foreground/80">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">CareAssurance</h1>
        </div>

        <Card className="bg-card/95 border-border/75">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Shield className="h-5 w-5 text-primary" />
              Privacy Policy
            </CardTitle>
            <p className="text-sm text-muted-foreground">Last updated: 29 January 2026</p>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-6 text-foreground/90">
            <div className="mb-6 rounded-lg border border-primary/20 bg-primary/10 p-4">
              <div className="flex items-start gap-3">
                <Shield className="h-6 w-6 flex-shrink-0 mt-0.5 text-primary" />
                <div>
                  <p className="mb-2 text-base font-semibold text-primary">SUMMARY</p>
                  <p className="text-sm text-foreground/85">
                    This Privacy Policy explains how CareAssurance handles personal data when you use the platform. It is written for UK users and aligns with the UK GDPR and the Data Protection Act 2018.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6 rounded-lg border border-secondary/20 bg-secondary/10 p-4">
              <div className="flex items-start gap-3">
                <Lock className="h-6 w-6 flex-shrink-0 mt-0.5 text-secondary" />
                <div>
                  <p className="mb-2 text-base font-semibold text-secondary">IMPORTANT NOTE</p>
                  <p className="text-sm text-foreground/85">
                    If you use CareAssurance on behalf of a care provider or organisation, that organisation is usually the <strong>Data Controller</strong> for the personal data inside uploaded documents, and CareAssurance operates as a <strong>Data Processor</strong>.
                  </p>
                </div>
              </div>
            </div>

            <section>
              <h3 className="text-lg font-semibold text-foreground">1. Who We Are</h3>
              <p className="text-muted-foreground">
                CareAssurance is proprietary software owned and operated by <strong>Lewis Barron</strong> (the "Operator").
              </p>
              <p className="text-muted-foreground">
                This Privacy Policy applies to the CareAssurance web application and related services (together, the “Service”).
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">2. Roles: Controller vs Processor</h3>
              <p className="text-muted-foreground">
                The terms "controller" and "processor" have the meanings given in UK GDPR.
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>
                  <strong>Your organisation</strong> is typically the <strong>Data Controller</strong> for personal data contained in uploaded care documents.
                </li>
                <li>
                  <strong>CareAssurance (Operator)</strong> typically acts as a <strong>Data Processor</strong>, processing that data only on documented instructions from the Controller and to provide the Service.
                </li>
                <li>
                  For limited account/admin/security information (e.g. platform authentication and security logs), the Operator may act as a <strong>Controller</strong>.
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">3. Categories of Data We Process</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Account data:</strong> username, name, role, organisation, access status, audit/terms acceptance metadata.</li>
                <li><strong>Uploaded document content:</strong> the text/structure of uploaded care documents, which may include special category (health) data.</li>
                <li><strong>Usage and security data:</strong> session identifiers, access times, high-level event logs, and security telemetry.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">4. Purposes and Legal Bases</h3>
              <p className="text-muted-foreground">
                When acting as Controller (for platform administration/security), the Operator processes personal data to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Provide and secure the Service (Article 6(1)(b) contract, and/or Article 6(1)(f) legitimate interests).</li>
                <li>Prevent fraud/abuse, maintain audit trails, and investigate incidents (Article 6(1)(f) legitimate interests; and Article 6(1)(c) where a legal obligation applies).</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                When acting as Processor (for uploaded documents), the Operator processes data on the Controller’s instructions. The Controller is responsible for identifying the appropriate Article 6 basis and, where applicable, an Article 9 condition for special category data.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">5. Special Category (Health) Data</h3>
              <div className="rounded-lg p-4 mb-4 bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-500" />
                  <div>
                    <p className="font-medium mb-2 text-amber-600">Health data may be included</p>
                    <p className="text-sm text-amber-900 dark:text-amber-300">
                      Uploaded documents may include health and care information. CareAssurance is designed to minimise retention and to apply access controls appropriate to this category of data.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground">
                If your organisation uploads special category data, your organisation (as Controller) must ensure a valid Article 9 condition applies (for example, health or social care provision/management, or substantial public interest where relevant).
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">6. Volatile Processing and Retention</h3>
              <div className="rounded-lg p-4 mb-4 bg-teal-500/10 border border-teal-500/20">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 flex-shrink-0 mt-0.5 text-teal-500" />
                  <div>
                    <p className="font-medium mb-2 text-teal-600">30-minute deletion model</p>
                    <p className="text-sm text-teal-800 dark:text-teal-300">
                      Uploaded document content is designed to be processed temporarily and automatically cleared after inactivity. Operational details may vary depending on deployment configuration.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground">
                Account records and security logs may be retained longer to operate the Service safely and to meet operational/security needs.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">7. AI and Subprocessors</h3>
              <div className="rounded-lg p-4 mb-4 bg-muted border border-border">
                <div className="flex items-start gap-3">
                  <Database className="h-5 w-5 flex-shrink-0 mt-0.5 text-blue-500" />
                  <div>
                    <p className="font-medium mb-2 text-foreground">Third-party processing</p>
                    <p className="text-sm text-muted-foreground">
                      Some features may send relevant text to third-party service providers (for example, AI model providers) to generate analyses or summaries.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground">
                Where third parties process personal data on our behalf, we put contractual safeguards in place (such as data processing terms) and require appropriate security measures.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">8. International Transfers</h3>
              <p className="text-muted-foreground">
                If a third-party provider processes data outside the UK, we rely on appropriate safeguards (for example, the UK Addendum to the EU Standard Contractual Clauses, or other recognised transfer mechanisms).
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">9. Security</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Encryption in transit (HTTPS/TLS).</li>
                <li>Role-based access controls.</li>
                <li>Authentication and session controls.</li>
                <li>Security logging for incident investigation.</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                No system is completely secure; we work to reduce risk and respond appropriately to incidents.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">10. Your Rights and Complaints</h3>
              <p className="text-muted-foreground">
                Individuals have rights under UK GDPR (including access, rectification, erasure, restriction, objection, and data portability) subject to legal conditions.
              </p>
              <p className="text-muted-foreground">
                If you are a user acting for a Controller organisation, requests about the content of care documents should normally be directed to your organisation.
              </p>
              <p className="mt-4 text-muted-foreground">
                You can complain to the ICO: <a href="https://ico.org.uk" className="hover:underline text-teal-500">ico.org.uk</a>
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">11. Cookies</h3>
              <p className="text-muted-foreground">
                The Service uses essential cookies for login/session management and security. It does not use advertising cookies.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">12. Contact</h3>
              <p className="text-muted-foreground">
                For privacy questions, please <a href="/#contact" className="font-semibold underline">Contact us</a> using the website contact form.
              </p>
              <p className="mt-4 text-muted-foreground">
                For requests about patient/service user data uploaded by your organisation, contact your organisation’s Data Protection Officer or privacy contact.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">7. Legal Basis for Processing</h3>
              <p className="text-muted-foreground">We process personal data under the following legal bases under Article 6 of UK GDPR:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Contractual Necessity (Article 6(1)(b)):</strong> Processing necessary to perform our contract with you and provide the Software</li>
                <li><strong>Legitimate Interests (Article 6(1)(f)):</strong> Processing necessary for our legitimate interests in providing compliance and audit tools to care organizations, provided these interests are not overridden by your rights</li>
                <li><strong>Legal Obligation (Article 6(1)(c)):</strong> Processing necessary to comply with legal obligations, including security logging and fraud prevention</li>
                <li><strong>Consent (Article 6(1)(a)):</strong> Where we rely on consent, you may withdraw it at any time</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">8. How We Use Personal Data</h3>
              <p className="text-muted-foreground">We use personal data for the following purposes:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Service Provision:</strong> To operate and deliver the CareAssurance platform and its features</li>
                <li><strong>Document Analysis:</strong> To parse, analyze, and generate insights from uploaded care documents</li>
                <li><strong>AI Processing:</strong> To provide AI-powered recommendations and compliance assistance</li>
                <li><strong>Authentication:</strong> To verify user identity and manage access permissions</li>
                <li><strong>Security:</strong> To detect, prevent, and respond to security incidents</li>
                <li><strong>Audit Logging:</strong> To maintain records of system access and usage for security purposes</li>
                <li><strong>Service Improvement:</strong> To analyze usage patterns and improve our Software (using anonymized data)</li>
                <li><strong>Communication:</strong> To send important service updates and notifications</li>
                <li><strong>Compliance:</strong> To meet our legal and regulatory obligations</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">9. AI and Third-Party Data Processing</h3>
              <div className="rounded-lg p-4 mb-4 bg-muted border border-border">
                <div className="flex items-start gap-3">
                  <Database className="h-5 w-5 flex-shrink-0 mt-0.5 text-blue-500" />
                  <div>
                    <p className="font-medium mb-2 text-foreground">OpenAI Data Processing Disclosure</p>
                    <p className="text-sm text-muted-foreground">
                      This platform uses OpenAI's API services for document analysis and AI-powered recommendations. When you upload documents, relevant text may be transmitted to OpenAI for processing.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground">
                <strong>Regarding OpenAI Processing:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Data transmitted to OpenAI is encrypted in transit using TLS</li>
                <li>OpenAI processes data according to their Data Processing Agreement (DPA) and API Terms</li>
                <li>OpenAI does not use API data to train their models (as per their current API data usage policy)</li>
                <li>Data is retained by OpenAI only for the duration necessary to process the request (typically up to 30 days for abuse monitoring, then deleted)</li>
                <li>We use OpenAI's API endpoint, not ChatGPT consumer products, which have different data policies</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                By using this Software, you acknowledge that document content may be processed by third-party AI services as described above.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">10. Data Retention</h3>
              <p className="text-muted-foreground">We retain different categories of data for different periods:</p>
              <div className="overflow-x-auto mt-4">
                <table className="min-w-full text-sm text-muted-foreground">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 text-foreground">Data Category</th>
                      <th className="text-left py-2 text-foreground">Retention Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border">
                      <td className="py-2 pr-4">Uploaded Documents</td>
                      <td className="py-2">30 minutes (auto-deleted)</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 pr-4">AI Processing Data</td>
                      <td className="py-2">Not retained after processing</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 pr-4">User Account Data</td>
                      <td className="py-2">Duration of account + 30 days</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 pr-4">Audit Results</td>
                      <td className="py-2">As required for compliance purposes</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2 pr-4">Session/Security Logs</td>
                      <td className="py-2">30 days</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4">Technical Logs</td>
                      <td className="py-2">90 days</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-muted-foreground">
                Upon termination of access by Lewis Barron, user account data will be deleted in accordance with these retention periods unless longer retention is required by law.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">11. Data Security Measures</h3>
              <p className="text-muted-foreground">
                We implement appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. These measures include:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Encryption in Transit:</strong> All data transmissions use HTTPS/TLS encryption</li>
                <li><strong>Authentication:</strong> Secure password hashing and session-based authentication</li>
                <li><strong>Access Control:</strong> Role-based access control limiting data access to authorized users</li>
                <li><strong>Session Management:</strong> Automatic session timeouts and secure session handling</li>
                <li><strong>Volatile Storage:</strong> Sensitive uploaded data stored only in temporary memory</li>
                <li><strong>Audit Logging:</strong> Comprehensive logging of access and actions for security monitoring</li>
                <li><strong>Regular Updates:</strong> Security patches and updates applied regularly</li>
                <li><strong>Incident Response:</strong> Procedures in place for detecting and responding to security incidents</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                While we take extensive measures to protect your data, no method of electronic transmission or storage is 100% secure. We cannot guarantee absolute security but commit to promptly addressing any security incidents.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">12. International Data Transfers</h3>
              <p className="text-muted-foreground">
                The Platform may transfer personal data outside the United Kingdom and European Economic Area (EEA), particularly in connection with third-party AI processing services (OpenAI servers are located in the United States).
              </p>
              <p className="mt-4 text-muted-foreground">
                Where such transfers occur, we ensure appropriate safeguards are in place, which may include:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Standard Contractual Clauses (SCCs) approved by the UK ICO or European Commission</li>
                <li>Adequacy decisions by the UK Secretary of State or European Commission</li>
                <li>Data Processing Agreements with third-party providers</li>
                <li>Additional technical and organizational measures as necessary</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">13. Your Data Protection Rights (UK GDPR)</h3>
              <p className="text-muted-foreground">
                Under UK GDPR, you have the following rights regarding your personal data:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Right of Access (Article 15):</strong> You have the right to request copies of your personal data and information about how we process it</li>
                <li><strong>Right to Rectification (Article 16):</strong> You have the right to request correction of inaccurate personal data</li>
                <li><strong>Right to Erasure (Article 17):</strong> You have the right to request deletion of your personal data in certain circumstances (note: uploaded documents are automatically deleted within 30 minutes)</li>
                <li><strong>Right to Restriction (Article 18):</strong> You have the right to request restriction of processing in certain circumstances</li>
                <li><strong>Right to Data Portability (Article 20):</strong> You have the right to receive your data in a structured, commonly used format</li>
                <li><strong>Right to Object (Article 21):</strong> You have the right to object to processing based on legitimate interests</li>
                <li><strong>Rights Related to Automated Decision-Making (Article 22):</strong> You have rights regarding automated decision-making and profiling</li>
                <li><strong>Right to Withdraw Consent:</strong> Where processing is based on consent, you may withdraw it at any time</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                To exercise any of these rights, please contact your organization's Data Protection Officer or the platform administrator. We will respond to your request within one month, as required by law.
              </p>
              <p className="mt-4 text-muted-foreground">
                <strong>Note:</strong> These data protection rights are separate from Lewis Barron's right to terminate access to the Software. Termination of access does not affect your ability to exercise your data protection rights regarding any personal data that has been collected.
              </p>
              <p className="mt-4 text-muted-foreground">
                <strong>Right to Complain:</strong> You have the right to lodge a complaint with the Information Commissioner's Office (ICO) if you believe your data protection rights have been violated. ICO contact: <a href="https://ico.org.uk" className="hover:underline text-teal-500">ico.org.uk</a>
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">14. Cookie Policy</h3>
              <p className="text-muted-foreground">
                The Platform uses cookies and similar technologies to provide and improve our Software. Cookies are small text files stored on your device that help us:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Essential Cookies:</strong> Necessary for the Platform to function, including session management and authentication. These cannot be disabled.</li>
                <li><strong>Security Cookies:</strong> Help protect against security threats and maintain secure sessions.</li>
                <li><strong>Preference Cookies:</strong> Remember your settings and preferences for a better experience.</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                We do not use advertising or third-party tracking cookies. The Platform primarily uses session cookies that are deleted when you close your browser.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">15. Changes to This Privacy Policy</h3>
              <p className="text-muted-foreground">
                Lewis Barron reserves the right to modify, amend, or update this Privacy Policy at any time. Changes will be effective immediately upon posting. Your continued use of the Software after any such changes constitutes your acceptance of the revised Privacy Policy.
              </p>
              <p className="mt-4 text-muted-foreground">
                We encourage you to review this Privacy Policy periodically to stay informed about how we are protecting your personal data.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">16. Intellectual Property, Name, and Design Rights</h3>
              <div className="rounded-lg p-4 mb-4 bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 flex-shrink-0 mt-0.5 text-blue-500" />
                  <div>
                    <p className="font-medium mb-2 text-blue-500">ORIGINAL WORK AND WAIVER OF CLAIMS</p>
                    <p className="text-sm text-muted-foreground">
                      The name "CareAssurance," the CareAssurance logo, all related names, logos, designs, user interface designs, visual elements, and all associated branding elements are the original creative works of Lewis Barron, independently conceived and created. All rights in and to these elements are exclusively reserved.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground">
                By using this Platform, you acknowledge and agree that all branding, names, logos, and design elements are original works independently created by and belonging exclusively to Lewis Barron. You hereby irrevocably waive, release, and discharge any and all claims against Lewis Barron relating to the Platform's name, branding, or design, including but not limited to any claims of infringement, passing off, unfair competition, or any similar claims. You agree not to bring, support, or participate in any legal action against Lewis Barron relating to these elements. For full details on intellectual property rights and restrictions, please refer to our Terms and Conditions.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">17. Contact Information</h3>
              <p className="text-muted-foreground">
                For questions regarding this Privacy Policy, to exercise your data protection rights, or to report a data protection concern, please contact Lewis Barron through the designated communication channels provided to authorized users.
              </p>
              <p className="mt-4 text-muted-foreground">
                For data protection matters relating to personal data you have uploaded (as a Data Controller), please contact your organization's Data Protection Officer.
              </p>
            </section>

            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-sm text-center text-muted-foreground">
                CareAssurance - Proprietary Software - All Rights Reserved
              </p>
              <p className="text-sm text-center mt-1 text-muted-foreground">
                Owner: Lewis Barron
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
