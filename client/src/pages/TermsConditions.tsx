import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, AlertTriangle, Shield } from "lucide-react";
import { Link } from "wouter";

export default function TermsConditions() {
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
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-foreground">
                <FileText className="h-5 w-5 text-primary" />
                Terms and Conditions
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary/10 px-2 py-1 font-mono text-xs text-primary">Version 1.1</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Last updated: 29 January 2026</p>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-6 text-foreground/90">
            <div className="mb-6 rounded-lg border border-primary/20 bg-primary/10 p-4">
              <div className="flex items-start gap-3">
                <Shield className="h-6 w-6 flex-shrink-0 mt-0.5 text-primary" />
                <div>
                  <p className="mb-2 text-base font-semibold text-primary">ABOUT THESE TERMS</p>
                  <p className="text-sm text-foreground/85">
                    These Terms govern access to and use of CareAssurance (the "Service"), proprietary software owned and operated by <strong>Lewis Barron</strong> (the "Owner/Operator").
                    The Service is intended for organisational use in care/compliance workflows and does not replace professional judgement.
                  </p>
                </div>
              </div>
            </div>

            <section>
              <h3 className="text-lg font-semibold text-foreground">1. Definitions</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>"Service"</strong> means the CareAssurance web application and related services.</li>
                <li><strong>"Customer/Organisation"</strong> means the entity on whose behalf you use the Service.</li>
                <li><strong>"User"</strong> means an individual authorised by the Customer/Organisation to access the Service.</li>
                <li><strong>"Customer Data"</strong> means data uploaded to or generated within the Service by Users on behalf of the Customer/Organisation, including document contents.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">2. Eligibility and Authority</h3>
              <p className="text-muted-foreground">
                You may use the Service only if you are authorised by your organisation and capable of forming a legally binding agreement. If you use the Service on behalf of an organisation, you confirm you have authority to bind that organisation to these Terms.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">3. Licence and Permitted Use</h3>
              <p className="text-muted-foreground">
                Subject to these Terms, the Owner grants you a limited, revocable, non-transferable, non-exclusive licence to access and use the Service for your organisation's internal business purposes.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">4. Account Security</h3>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>You must keep credentials confidential and not share accounts.</li>
                <li>You are responsible for activity under your account unless caused by the Owner's breach of security obligations.</li>
                <li>Report suspected compromise promptly.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">5. Acceptable Use</h3>
              <p className="text-muted-foreground">You must not:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Use the Service unlawfully or in breach of applicable regulations.</li>
                <li>Upload content without proper authority/legal basis (including where special category data is involved).</li>
                <li>Attempt to bypass security controls, probe vulnerabilities, or interfere with service operation.</li>
                <li>Reverse engineer or create derivative works except where permitted by mandatory law.</li>
                <li>Use the Service to build a competing product using confidential information obtained through access.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">6. Data Protection and Customer Responsibilities</h3>
              <p className="text-muted-foreground">
                Where the Customer/Organisation uploads documents containing personal data (including health data), the Customer/Organisation is typically the Data Controller and is responsible for:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Having an appropriate Article 6 legal basis and, where required, an Article 9 condition for special category data.</li>
                <li>Providing required privacy information to data subjects.</li>
                <li>Ensuring appropriate policies/consents and completing DPIAs where needed.</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                The Owner will process Customer Data as a processor where applicable, and in line with the Service's documented functionality and any agreed processing terms.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">7. AI Features and Human Review</h3>
              <div className="rounded-lg p-4 mb-4 bg-warning/8 border border-warning/20">
                <p className="font-medium mb-2 text-warning">DECISION SUPPORT ONLY</p>
                <p className="text-sm text-foreground/80">
                  The Service may generate outputs using automated processing (including AI). Outputs may be incomplete or inaccurate. You must review and validate outputs before acting on them.
                </p>
              </div>
              <p className="text-muted-foreground">
                The Service is not medical advice, legal advice, or a substitute for qualified professional judgement.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">8. Volatile Processing and Retention</h3>
              <p className="text-muted-foreground">
                The Service is designed to minimise retention of uploaded documents and to clear temporary processing data after inactivity. Operational details may vary by deployment; always follow your organisation's information governance requirements.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">9. Intellectual Property</h3>
              <p className="text-muted-foreground">
                The Service (including its code, design, and branding) is owned by the Owner. Except for the limited licence granted above, no rights are granted.
              </p>
              <p className="text-muted-foreground">
                You retain rights in Customer Data. You grant the Owner a limited right to process Customer Data solely to provide, secure, and improve the Service.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">10. Confidentiality</h3>
              <p className="text-muted-foreground">
                You must keep non-public information about the Service (including implementation details and security controls) confidential and use it only for permitted purposes.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">11. Suspension and Termination</h3>
              <p className="text-muted-foreground">
                The Owner may suspend or terminate access where reasonably necessary to protect the Service, comply with law, address misuse, or respond to security incidents. Where practicable, notice will be provided.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">12. Disclaimer of Warranties</h3>
              <div className="rounded-lg p-4 mb-4 bg-muted border border-border">
                <p className="text-sm text-muted-foreground">
                  The Service is provided "as is" and "as available". To the fullest extent permitted by law, the Owner disclaims all warranties, whether express or implied, including fitness for a particular purpose and non-infringement.
                </p>
              </div>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">13. Limitation of Liability</h3>
              <div className="rounded-lg p-4 mb-4 bg-destructive/[0.06] border border-destructive/20">
                <p className="font-medium mb-2 text-destructive">IMPORTANT</p>
                <p className="text-sm text-foreground/80">
                  Nothing in these Terms excludes or limits liability for death or personal injury caused by negligence, fraud/fraudulent misrepresentation, or any liability that cannot be excluded under applicable law.
                </p>
              </div>
              <p className="text-muted-foreground">
                Subject to the paragraph above, the Owner is not liable for indirect or consequential losses, or losses arising from reliance on outputs without appropriate professional review.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">14. Changes to the Terms</h3>
              <p className="text-muted-foreground">
                The Owner may update these Terms. Material changes will be posted in the Service. Continued use after the effective date means you accept the updated Terms.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">15. Governing Law</h3>
              <p className="text-muted-foreground">
                These Terms are governed by the laws of England and Wales, and the courts of England and Wales have exclusive jurisdiction.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">16. Contact</h3>
              <p className="text-muted-foreground">
                For questions about these Terms, please <a href="/#contact" className="font-semibold underline">Contact us</a> using the website contact form.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">7. Regulatory Compliance Responsibility</h3>
              <div className="rounded-lg p-4 mb-4 bg-destructive/[0.06] border border-destructive/20">
                <p className="font-medium mb-2 text-destructive">USER ASSUMES ALL REGULATORY COMPLIANCE RISK</p>
                <p className="text-sm text-foreground/80">
                  By using this Software, you explicitly acknowledge and agree that YOU bear sole and complete responsibility for ensuring compliance with all applicable regulations, including but not limited to CQC (Care Quality Commission) requirements, NICE guidelines, NHS standards, and any other regulatory frameworks applicable to your organization and jurisdiction.
                </p>
              </div>
              <p className="text-muted-foreground">
                The Platform does not guarantee compliance with any regulatory standard. All compliance determinations must be made by qualified professionals within your organization. Lewis Barron accepts no liability for regulatory failures, inspection outcomes, or compliance deficiencies.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">8. Prohibited Uses</h3>
              <p className="text-muted-foreground">You agree NOT to use the Software for any of the following purposes:</p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Any unlawful purpose or in violation of any applicable laws or regulations</li>
                <li>Uploading documents without proper authorization or consent</li>
                <li>Processing data of individuals without a lawful basis</li>
                <li>Attempting to circumvent, disable, or interfere with security features</li>
                <li>Accessing or attempting to access accounts or systems without authorization</li>
                <li>Introducing malicious code, viruses, or other harmful materials</li>
                <li>Scraping, data mining, or automated collection of information</li>
                <li>Reverse engineering, decompiling, or disassembling any part of the Platform</li>
                <li>Using the Software to create competing products or services</li>
                <li>Sharing, reselling, or redistributing access to the Platform without authorization from Lewis Barron</li>
                <li>Using outputs to make clinical decisions without proper professional review</li>
                <li>Misrepresenting AI-generated content as professional medical or legal advice</li>
                <li>Any use that could harm service users, patients, or vulnerable adults</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">9. AI-Generated Content and Limitations</h3>
              <p className="text-muted-foreground">
                This Platform utilizes artificial intelligence and machine learning technologies. By using this Software, you acknowledge and understand that:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>AI Outputs May Be Inaccurate:</strong> AI-generated content may contain errors, omissions, inaccuracies, or fabricated information</li>
                <li><strong>No Guarantee of Accuracy:</strong> No representations or warranties are made regarding the accuracy, completeness, reliability, or suitability of AI-generated outputs</li>
                <li><strong>Professional Review Required:</strong> All AI outputs MUST be reviewed, verified, and approved by qualified professionals before implementation</li>
                <li><strong>Not a Substitute for Expertise:</strong> AI cannot replace human judgment, clinical expertise, or professional knowledge</li>
                <li><strong>Context Limitations:</strong> AI may not fully understand context, nuance, or specific circumstances relevant to individual cases</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                Lewis Barron expressly disclaims any liability arising from reliance on AI-generated content without proper professional verification.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">10. Data Handling and Volatile Storage</h3>
              <p className="text-muted-foreground">
                <strong className="text-warning">Important:</strong> All uploaded documents are stored in volatile (temporary) memory only. This "Privacy by Design" approach ensures that sensitive data is not permanently retained. Uploaded files are automatically and permanently deleted:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>After 30 minutes of session inactivity</li>
                <li>When navigating away from the relevant section</li>
                <li>Upon session logout or browser closure</li>
                <li>When the data retention timer expires</li>
                <li>Upon user-initiated deletion</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                No uploaded documents are permanently stored on our servers. Users are responsible for ensuring this temporary processing meets their own data protection obligations.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">11. Intellectual Property Rights</h3>
              <div className="rounded-lg p-4 mb-4 bg-muted border border-border">
                <p className="font-medium mb-2 text-foreground">ALL RIGHTS RESERVED</p>
                <p className="text-sm text-muted-foreground">
                  All content, design, functionality, code, algorithms, trademarks, logos, and other intellectual property associated with CareAssurance are exclusively owned by Lewis Barron and are protected by copyright, trademark, and other intellectual property laws. No license or right is granted to you by implication, estoppel, or otherwise except as expressly set forth in these Terms.
                </p>
              </div>
              <p className="text-muted-foreground">
                <strong>User Content:</strong> You retain ownership of documents and data you upload to the Platform. By uploading content, you grant the Platform a limited, non-exclusive, temporary license to process such content solely for the purpose of providing the Service. This license terminates upon deletion of the content.
              </p>
              <p className="mt-4 text-muted-foreground">
                <strong>Restrictions:</strong> You may not copy, modify, distribute, sell, or lease any part of this Software or included materials, nor may you reverse engineer or attempt to extract the source code, without express written permission from Lewis Barron.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">11A. Name, Branding, and Design Rights</h3>
              <div className="rounded-lg p-4 mb-4 bg-blue-500/[0.08] border border-blue-500/20">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 flex-shrink-0 mt-0.5 text-blue-500" />
                  <div>
                    <p className="font-medium mb-2 text-blue-700">ORIGINAL WORK AND PROPRIETARY RIGHTS</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                      The name "CareAssurance," the CareAssurance logo, all related names, logos, product and service names, designs, user interface designs, visual elements, and all associated branding elements are the original creative works of Lewis Barron. These elements were independently conceived, created, and developed by Lewis Barron without reference to or copying of any third-party works. All rights in and to these elements are exclusively reserved.
                    </p>
                  </div>
                </div>
              </div>
              <p className="mb-4 text-muted-foreground">
                <strong>User Acknowledgments and Agreements:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li><strong>Original Creation:</strong> You acknowledge that the CareAssurance name, branding, and design are the original independent creations of Lewis Barron.</li>
                <li><strong>No License Granted:</strong> Nothing contained on this Platform or in these Terms should be construed as granting any license or right to use the CareAssurance name, logo, or design elements without the prior express written permission of Lewis Barron.</li>
                <li><strong>Design Rights:</strong> The visual design, layout, look and feel, color schemes, iconography, typography, and overall aesthetic of the Platform are proprietary to Lewis Barron.</li>
              </ul>
              <div className="rounded-lg p-4 mt-4 mb-4 bg-blue-500/[0.08] border border-blue-500/20">
                <p className="font-medium mb-2 text-blue-700">BRANDING AND DESIGN</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  The CareAssurance name, logo, and visual design belong to Lewis Barron. Using the platform does not grant rights to reuse or adapt these elements. If you have questions or concerns about branding or design, please contact the Owner to discuss.
                </p>
              </div>
              <p className="text-muted-foreground">
                Nothing in these Terms limits any rights you may have under applicable law; this section clarifies that branding is reserved to the Owner.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">12. Confidentiality and Non-Disclosure</h3>
              <div className="rounded-lg p-4 mb-4 bg-purple-500/[0.08] border border-purple-500/20">
                <p className="font-medium mb-2 text-violet-600">BINDING CONFIDENTIALITY AGREEMENT</p>
                <p className="text-sm text-violet-900 dark:text-violet-300">
                  By accessing this Software, you enter into a legally binding confidentiality agreement. All aspects of CareAssurance, including but not limited to its functionality, features, user interface, workflows, algorithms, methods, processes, and business model constitute Confidential Information owned exclusively by Lewis Barron.
                </p>
              </div>
              <p className="mb-4 text-muted-foreground">
                <strong>Confidential Information includes:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>The concept, design, and implementation of the Software</li>
                <li>All features, functions, and capabilities observed during use</li>
                <li>Source code, algorithms, data structures, and technical architecture</li>
                <li>Business methods, pricing strategies, and operational processes</li>
                <li>Any information marked as confidential or that a reasonable person would understand to be confidential</li>
                <li>Knowledge gained through demonstrations, presentations, or access to the Platform</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                <strong>You agree to:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Keep all Confidential Information strictly confidential</li>
                <li>Not disclose any Confidential Information to any third party without prior written consent from Lewis Barron</li>
                <li>Not use Confidential Information for any purpose other than as permitted under these Terms</li>
                <li>Take all reasonable precautions to prevent unauthorized disclosure</li>
                <li>Immediately notify Lewis Barron of any unauthorized disclosure or use</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">13. Non-Copying and Non-Replication</h3>
              <div className="rounded-lg p-4 mb-4 bg-destructive/[0.06] border border-destructive/20">
                <p className="font-medium mb-2 text-destructive">ABSOLUTE PROHIBITION ON COPYING</p>
                <p className="text-sm text-foreground/80">
                  You are strictly prohibited from copying, replicating, reproducing, or creating derivative works based on any aspect of CareAssurance. This prohibition applies regardless of whether you have been granted access to the Software, viewed a demonstration, or been presented with the concept in any form.
                </p>
              </div>
              <p className="mb-4 text-muted-foreground">
                <strong>Prohibited activities include but are not limited to:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Developing, commissioning, or contributing to any software, application, or service that replicates or is substantially similar to CareAssurance or any of its features</li>
                <li>Using knowledge gained from access to CareAssurance to create competing products or services</li>
                <li>Sharing information about CareAssurance with any person or entity for the purpose of enabling them to create similar software</li>
                <li>Hiring, contracting, or engaging with developers to recreate any functionality observed in CareAssurance</li>
                <li>Adapting the concepts, workflows, or methods used in CareAssurance for use in other software</li>
                <li>Assisting any third party in any activity that would violate these prohibitions</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                This prohibition continues indefinitely and survives termination of your access to the Software.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">14. Non-Circumvention</h3>
              <p className="text-muted-foreground">
                You agree not to circumvent, bypass, or attempt to circumvent Lewis Barron's relationship with users, customers, partners, or any business opportunities related to CareAssurance. This includes:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                <li>Not approaching Lewis Barron's contacts, customers, or partners to offer competing services</li>
                <li>Not using information obtained through CareAssurance to divert business opportunities</li>
                <li>Not interfering with any business relationship or prospective business relationship of Lewis Barron</li>
                <li>Not soliciting employees, contractors, or collaborators of Lewis Barron for competing projects</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">15. Consequences of Violation</h3>
              <div className="rounded-lg p-4 mb-4 bg-slate-50/90 dark:bg-slate-800/90 border border-border">
                <p className="font-medium mb-2 text-foreground">If these Terms are breached</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Serious breaches (for example, misuse of data, unauthorised copying, or security risks) may result in suspension and, where needed, appropriate legal remedies. Our aim is to resolve issues proportionately while protecting service users, data subjects, and the platform.
                </p>
              </div>
              <p className="mt-4 text-muted-foreground">
                If you believe an action or notice was issued in error, please contact the Owner to discuss a resolution.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">16. Disclaimer of Warranties</h3>
              <div className="rounded-lg p-4 mb-4 bg-muted border border-border">
                <p className="text-sm uppercase tracking-wide font-medium mb-2 text-foreground">Legal Notice</p>
                <p className="text-sm text-muted-foreground">
                  THE SOFTWARE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, LEWIS BARRON DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
                </p>
              </div>
              <p className="text-muted-foreground">
                You use the Software at your own risk. Lewis Barron does not warrant that the Software is suitable for use in any particular healthcare, clinical, or regulatory context.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">17. Limitation of Liability</h3>
              <div className="rounded-lg p-4 mb-4 bg-destructive/[0.06] border border-destructive/20">
                <p className="font-medium mb-2 text-destructive">LIMITATION OF LIABILITY</p>
                <p className="text-sm text-foreground/80">
                  TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL LEWIS BARRON, HIS AFFILIATES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, GOODWILL, USE, DATA, OR OTHER INTANGIBLE LOSSES, REGARDLESS OF WHETHER ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
                </p>
              </div>
              <p className="text-muted-foreground">
                Lewis Barron shall not be liable for decisions made based on Platform outputs, clinical outcomes, regulatory penalties, data breaches, business interruption, loss of data, third-party claims, inaccuracies in AI-generated content, or failure to achieve compliance with any regulatory standard.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">18. Indemnification</h3>
              <p className="text-muted-foreground">
                You agree to defend, indemnify, and hold harmless Lewis Barron, his affiliates, licensors, and service providers from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable attorneys' fees) arising out of or relating to your violation of these Terms, your use of the Software, your violation of any rights of another party, your violation of any applicable laws or regulations, content or data you upload, decisions or actions taken based on Platform outputs, claims by patients or service users, or regulatory enforcement actions.
              </p>
              <p className="mt-4 text-muted-foreground">
                Branding and design remain with the Owner; nothing in this section changes that. If you have a concern about branding or design, raise it directly so it can be addressed.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">19. Termination</h3>
              <div className="rounded-lg p-4 mb-4 bg-warning/8 border border-warning/20">
                <p className="font-medium mb-2 text-warning">Service Suspension or Termination</p>
                <p className="text-sm text-foreground/80">
                  Access may be suspended or ended where there is a breach of these Terms, a security or compliance risk, or where continued use is not commercially viable. We will usually give notice and a chance to address issues unless urgent action is required to protect users or data.
                </p>
              </div>
              <p className="text-muted-foreground">
                <strong>Account Security:</strong> You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
              </p>
              <p className="mt-4 text-muted-foreground">
                <strong>Effect of Termination:</strong> When access ends, you must stop using the Software. Provisions that need to continue (for example, intellectual property, limitations, and confidentiality) will survive as usual under applicable law.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">20. Modifications to Terms</h3>
              <p className="text-muted-foreground">
                Lewis Barron reserves the right to modify, amend, or update these Terms at any time without prior notice. Changes will be effective immediately upon posting. Your continued use of the Software after any such changes constitutes your acceptance of the new Terms. It is your responsibility to review these Terms periodically for updates.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">21. Governing Law and Jurisdiction</h3>
              <p className="text-muted-foreground">
                These Terms shall be governed by and construed in accordance with the laws of England and Wales. Any disputes arising out of or relating to these Terms or your use of the Software shall be subject to the exclusive jurisdiction of the courts of England and Wales.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">22. Severability</h3>
              <p className="text-muted-foreground">
                If any provision of these Terms is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect. The invalid or unenforceable provision shall be modified to the minimum extent necessary to make it valid and enforceable while preserving the original intent.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">23. Entire Agreement</h3>
              <p className="text-muted-foreground">
                These Terms, together with the Privacy Policy, constitute the entire agreement between you and Lewis Barron regarding your use of the Software and supersede all prior or contemporaneous communications, representations, or agreements, whether oral or written.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-foreground">24. Contact Information</h3>
              <p className="text-muted-foreground">
                For questions regarding these Terms or to request authorization for access, please contact Lewis Barron through the designated communication channels provided to authorized users.
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
