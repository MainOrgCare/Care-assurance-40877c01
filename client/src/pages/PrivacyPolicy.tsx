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
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-foreground">CareAssurance</h1>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Shield className="h-5 w-5 text-primary" />
              Privacy Policy
            </CardTitle>
            <p className="text-sm text-muted-foreground">Last updated: December 2025</p>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-6 text-foreground">
            
            <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <Shield className="h-6 w-6 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-blue-300 font-bold text-base mb-2">SOFTWARE OWNERSHIP</p>
                  <p className="text-blue-200/90 text-sm">
                    CareAssurance is proprietary software owned exclusively by <strong>Lewis Barron</strong>. All rights are reserved. This Privacy Policy explains how personal data is collected, used, and protected when using this software. Access to this software is granted at the sole discretion of the Owner and may be revoked at any time.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-teal-950/30 border border-teal-800/50 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <Lock className="h-6 w-6 text-teal-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-teal-300 font-bold text-base mb-2">UK GDPR COMPLIANT</p>
                  <p className="text-teal-200/90 text-sm">
                    This Privacy Policy has been prepared in accordance with the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018, and applicable guidance from the Information Commissioner's Office (ICO). We are committed to protecting your personal data and being transparent about how we collect and use it.
                  </p>
                </div>
              </div>
            </div>

            <section>
              <h3 className="text-lg font-semibold text-foreground">1. Introduction and Scope</h3>
              <p className="text-muted-foreground">
                This Privacy Policy explains how CareAssurance, proprietary software owned by Lewis Barron ("the Platform," "the Software," "we," "us," or "our"), collects, uses, discloses, and protects personal data when you use our services.
              </p>
              <p className="text-muted-foreground">
                This Policy applies to all users of the Platform, including care facility staff, administrators, and any other individuals who access or interact with the Software. It also addresses the processing of personal data contained within documents uploaded to the Platform, including data relating to service users, patients, and care workers.
              </p>
              <p className="text-muted-foreground">
                By using CareAssurance, you acknowledge that you have read and understood this Privacy Policy and agree to the collection and use of information in accordance with this Policy.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">2. Data Controller and Ownership</h3>
              <p className="text-muted-foreground">
                For the purposes of UK GDPR and the Data Protection Act 2018:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>Software Owner:</strong> CareAssurance is wholly owned by Lewis Barron. All intellectual property rights, data processing decisions, and operational control of the Platform rest with Lewis Barron.</li>
                <li><strong>Data Controller (User Data):</strong> The organization (care facility, healthcare provider, or other entity) that uses the CareAssurance platform is the Data Controller for any personal data they upload to the Platform. The Data Controller determines the purposes and means of processing personal data.</li>
                <li><strong>Data Processor:</strong> Lewis Barron, as the operator of the CareAssurance platform, acts as a Data Processor, processing personal data only on behalf of and under the instructions of the Data Controller. We process data solely for the purposes of providing the Software as described in our Terms and Conditions.</li>
              </ul>
              <p className="text-muted-foreground mt-4">
                As the Data Controller, your organization is responsible for ensuring that appropriate legal bases exist for processing, that data subjects have been informed of the processing, and that all necessary consents have been obtained where required.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">3. Owner's Rights Regarding Access</h3>
              <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-200 font-medium mb-2">Access at Owner's Discretion</p>
                    <p className="text-amber-100/80 text-sm">
                      Lewis Barron reserves the absolute right to grant, modify, suspend, or terminate access to the Platform at any time, for any reason or no reason, without prior notice. This right exists independently of any data protection rights and is a condition of using the Software.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground">
                Upon termination of access, any personal data stored in your user account may be deleted in accordance with our data retention policies. Uploaded documents processed in volatile memory will be automatically deleted within 30 minutes regardless of access status.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">4. Categories of Personal Data Collected</h3>
              <p className="text-muted-foreground">We may collect and process the following categories of personal data:</p>
              
              <h4 className="text-md font-medium text-foreground mt-4">4.1 User Account Data</h4>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Username and login credentials (password stored in hashed format)</li>
                <li>Full name and job title</li>
                <li>Role and access permissions</li>
                <li>Organization affiliation</li>
                <li>Contact information (if provided)</li>
              </ul>

              <h4 className="text-md font-medium text-foreground mt-4">4.2 Uploaded Document Data (Volatile/Temporary)</h4>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Care plans and care assessments</li>
                <li>Electronic Medication Administration Records (EMAR)</li>
                <li>Visit logs and call records</li>
                <li>Risk assessments and care reviews</li>
                <li>Service user personal and health information contained within uploaded documents</li>
                <li>Care worker information contained within uploaded documents</li>
              </ul>

              <h4 className="text-md font-medium text-foreground mt-4">4.3 Technical and Usage Data</h4>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>IP addresses and device identifiers</li>
                <li>Browser type and version</li>
                <li>Operating system information</li>
                <li>Access times and dates</li>
                <li>Pages visited and features used</li>
                <li>Session duration and activity logs</li>
              </ul>

              <h4 className="text-md font-medium text-foreground mt-4">4.4 Audit and Compliance Data</h4>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Audit results and compliance scores</li>
                <li>Analysis outputs and recommendations (may be anonymized)</li>
                <li>Reference identifiers for processed documents</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">5. Special Category Data</h3>
              <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-200 font-medium mb-2">Health Data Processing</p>
                    <p className="text-amber-100/80 text-sm">
                      Documents uploaded to CareAssurance may contain special category data, including health information, medication records, and care needs. This data is processed solely for the legitimate purposes of care compliance, quality assurance, and audit functions. Such processing is subject to strict safeguards and temporary storage only.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground">
                Where special category data is processed, we rely on the following conditions under Article 9 of UK GDPR:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Processing is necessary for reasons of substantial public interest (quality and safety of health or social care)</li>
                <li>Processing is necessary for the provision of health or social care services</li>
                <li>Explicit consent from the Data Controller where appropriate</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">6. Volatile Data Processing and Automatic Deletion</h3>
              <div className="bg-teal-950/30 border border-teal-800/50 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-teal-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-teal-200 font-medium mb-2">30-Minute Auto-Deletion</p>
                    <p className="text-teal-100/80 text-sm">
                      This platform implements "Privacy by Design" and "Data Minimization" principles. All uploaded documents containing personal data are processed in volatile (temporary) memory only and are <strong>automatically and permanently deleted within 30 minutes of inactivity</strong> or when you leave the relevant section.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground">
                <strong>How Volatile Processing Works:</strong>
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>Upload:</strong> When you upload a document, it is loaded into temporary server memory for processing</li>
                <li><strong>Processing:</strong> AI analysis and document parsing occur in real-time</li>
                <li><strong>Timer:</strong> A 30-minute inactivity timer begins upon upload</li>
                <li><strong>Auto-Deletion:</strong> Data is permanently and irreversibly deleted when:
                  <ul className="list-disc pl-6 mt-2 space-y-1">
                    <li>30 minutes pass without activity</li>
                    <li>You navigate away from the processing section</li>
                    <li>You log out of the Platform</li>
                    <li>Your browser session ends</li>
                    <li>You manually trigger deletion</li>
                  </ul>
                </li>
                <li><strong>No Backup:</strong> Deleted data cannot be recovered as it is never written to permanent storage</li>
              </ul>
              <p className="text-muted-foreground mt-4">
                This approach significantly reduces data protection risks by ensuring sensitive personal and health data exists only for the minimum time necessary to provide the Software.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">7. Legal Basis for Processing</h3>
              <p className="text-muted-foreground">We process personal data under the following legal bases under Article 6 of UK GDPR:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>Contractual Necessity (Article 6(1)(b)):</strong> Processing necessary to perform our contract with you and provide the Software</li>
                <li><strong>Legitimate Interests (Article 6(1)(f)):</strong> Processing necessary for our legitimate interests in providing compliance and audit tools to care organizations, provided these interests are not overridden by your rights</li>
                <li><strong>Legal Obligation (Article 6(1)(c)):</strong> Processing necessary to comply with legal obligations, including security logging and fraud prevention</li>
                <li><strong>Consent (Article 6(1)(a)):</strong> Where we rely on consent, you may withdraw it at any time</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">8. How We Use Personal Data</h3>
              <p className="text-muted-foreground">We use personal data for the following purposes:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
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
              <div className="bg-muted/50 border border-border rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <Database className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-foreground font-medium mb-2">OpenAI Data Processing Disclosure</p>
                    <p className="text-muted-foreground text-sm">
                      This platform uses OpenAI's API services for document analysis and AI-powered recommendations. When you upload documents, relevant text may be transmitted to OpenAI for processing.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground">
                <strong>Regarding OpenAI Processing:</strong>
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Data transmitted to OpenAI is encrypted in transit using TLS</li>
                <li>OpenAI processes data according to their Data Processing Agreement (DPA) and API Terms</li>
                <li>OpenAI does not use API data to train their models (as per their current API data usage policy)</li>
                <li>Data is retained by OpenAI only for the duration necessary to process the request (typically up to 30 days for abuse monitoring, then deleted)</li>
                <li>We use OpenAI's API endpoint, not ChatGPT consumer products, which have different data policies</li>
              </ul>
              <p className="text-muted-foreground mt-4">
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
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="py-2 pr-4">Uploaded Documents</td>
                      <td className="py-2">30 minutes (auto-deleted)</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4">AI Processing Data</td>
                      <td className="py-2">Not retained after processing</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4">User Account Data</td>
                      <td className="py-2">Duration of account + 30 days</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4">Audit Results</td>
                      <td className="py-2">As required for compliance purposes</td>
                    </tr>
                    <tr>
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
              <p className="text-muted-foreground mt-4">
                Upon termination of access by Lewis Barron, user account data will be deleted in accordance with these retention periods unless longer retention is required by law.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">11. Data Security Measures</h3>
              <p className="text-muted-foreground">
                We implement appropriate technical and organizational security measures to protect personal data against unauthorized access, alteration, disclosure, or destruction. These measures include:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>Encryption in Transit:</strong> All data transmissions use HTTPS/TLS encryption</li>
                <li><strong>Authentication:</strong> Secure password hashing and session-based authentication</li>
                <li><strong>Access Control:</strong> Role-based access control limiting data access to authorized users</li>
                <li><strong>Session Management:</strong> Automatic session timeouts and secure session handling</li>
                <li><strong>Volatile Storage:</strong> Sensitive uploaded data stored only in temporary memory</li>
                <li><strong>Audit Logging:</strong> Comprehensive logging of access and actions for security monitoring</li>
                <li><strong>Regular Updates:</strong> Security patches and updates applied regularly</li>
                <li><strong>Incident Response:</strong> Procedures in place for detecting and responding to security incidents</li>
              </ul>
              <p className="text-muted-foreground mt-4">
                While we take extensive measures to protect your data, no method of electronic transmission or storage is 100% secure. We cannot guarantee absolute security but commit to promptly addressing any security incidents.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">12. International Data Transfers</h3>
              <p className="text-muted-foreground">
                The Platform may transfer personal data outside the United Kingdom and European Economic Area (EEA), particularly in connection with third-party AI processing services (OpenAI servers are located in the United States).
              </p>
              <p className="text-muted-foreground mt-4">
                Where such transfers occur, we ensure appropriate safeguards are in place, which may include:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
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
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>Right of Access (Article 15):</strong> You have the right to request copies of your personal data and information about how we process it</li>
                <li><strong>Right to Rectification (Article 16):</strong> You have the right to request correction of inaccurate personal data</li>
                <li><strong>Right to Erasure (Article 17):</strong> You have the right to request deletion of your personal data in certain circumstances (note: uploaded documents are automatically deleted within 30 minutes)</li>
                <li><strong>Right to Restriction (Article 18):</strong> You have the right to request restriction of processing in certain circumstances</li>
                <li><strong>Right to Data Portability (Article 20):</strong> You have the right to receive your data in a structured, commonly used format</li>
                <li><strong>Right to Object (Article 21):</strong> You have the right to object to processing based on legitimate interests</li>
                <li><strong>Rights Related to Automated Decision-Making (Article 22):</strong> You have rights regarding automated decision-making and profiling</li>
                <li><strong>Right to Withdraw Consent:</strong> Where processing is based on consent, you may withdraw it at any time</li>
              </ul>
              <p className="text-muted-foreground mt-4">
                To exercise any of these rights, please contact your organization's Data Protection Officer or the platform administrator. We will respond to your request within one month, as required by law.
              </p>
              <p className="text-muted-foreground mt-4">
                <strong>Note:</strong> These data protection rights are separate from Lewis Barron's right to terminate access to the Software. Termination of access does not affect your ability to exercise your data protection rights regarding any personal data that has been collected.
              </p>
              <p className="text-muted-foreground mt-4">
                <strong>Right to Complain:</strong> You have the right to lodge a complaint with the Information Commissioner's Office (ICO) if you believe your data protection rights have been violated. ICO contact: <a href="https://ico.org.uk" className="text-teal-400 hover:underline">ico.org.uk</a>
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">14. Cookie Policy</h3>
              <p className="text-muted-foreground">
                The Platform uses cookies and similar technologies to provide and improve our Software. Cookies are small text files stored on your device that help us:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li><strong>Essential Cookies:</strong> Necessary for the Platform to function, including session management and authentication. These cannot be disabled.</li>
                <li><strong>Security Cookies:</strong> Help protect against security threats and maintain secure sessions.</li>
                <li><strong>Preference Cookies:</strong> Remember your settings and preferences for a better experience.</li>
              </ul>
              <p className="text-muted-foreground mt-4">
                We do not use advertising or third-party tracking cookies. The Platform primarily uses session cookies that are deleted when you close your browser.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">15. Changes to This Privacy Policy</h3>
              <p className="text-muted-foreground">
                Lewis Barron reserves the right to modify, amend, or update this Privacy Policy at any time. Changes will be effective immediately upon posting. Your continued use of the Software after any such changes constitutes your acceptance of the revised Privacy Policy.
              </p>
              <p className="text-muted-foreground mt-4">
                We encourage you to review this Privacy Policy periodically to stay informed about how we are protecting your personal data.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">16. Intellectual Property, Name, and Design Rights</h3>
              <div className="bg-blue-950/30 border border-blue-900/50 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-blue-200 font-medium mb-2">ORIGINAL WORK AND WAIVER OF CLAIMS</p>
                    <p className="text-blue-100/80 text-sm">
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
              <p className="text-muted-foreground mt-4">
                For data protection matters relating to personal data you have uploaded (as a Data Controller), please contact your organization's Data Protection Officer.
              </p>
            </section>

            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-sm text-muted-foreground text-center">
                CareAssurance - Proprietary Software - All Rights Reserved
              </p>
              <p className="text-sm text-muted-foreground text-center mt-1">
                Owner: Lewis Barron
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
