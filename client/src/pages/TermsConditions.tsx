import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, AlertTriangle, Shield } from "lucide-react";
import { Link } from "wouter";

export default function TermsConditions() {
  return (
    <div className="min-h-screen p-4 md:p-8" style={{ backgroundColor: '#f8fafc' }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/login">
            <Button variant="ghost" size="icon" data-testid="button-back" style={{ color: '#334155' }}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: '#0f172a' }}>CareAssurance</h1>
        </div>

        <Card style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2" style={{ color: '#0f172a' }}>
                <FileText className="h-5 w-5" style={{ color: '#3b82f6' }} />
                Terms and Conditions
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-2 py-1 rounded" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>Version 1.0</span>
              </div>
            </div>
            <p className="text-sm" style={{ color: '#64748b' }}>Last updated: January 2026</p>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none space-y-6" style={{ color: '#334155' }}>
            
            <div className="rounded-lg p-4 mb-6" style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <div className="flex items-start gap-3">
                <Shield className="h-6 w-6 flex-shrink-0 mt-0.5" style={{ color: '#2563eb' }} />
                <div>
                  <p className="font-bold text-base mb-2" style={{ color: '#1d4ed8' }}>ABOUT THESE TERMS</p>
                  <p className="text-sm" style={{ color: '#334155' }}>
                    CareAssurance is proprietary software owned by <strong>Lewis Barron</strong> and provided to authorised users under these Terms. The platform is an assistive tool and does not replace professional judgment. By continuing, you confirm you are authorised to use the service and will review all outputs before acting on them.
                  </p>
                </div>
              </div>
            </div>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>1. Software Ownership and Rights</h3>
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#3b82f6' }} />
                  <div>
                    <p className="font-medium mb-2" style={{ color: '#1d4ed8' }}>PROPRIETARY SOFTWARE</p>
                    <p className="text-sm" style={{ color: '#334155' }}>
                      CareAssurance is proprietary software owned by <strong>Lewis Barron</strong>. All intellectual property rights in the platform, its code, design, and materials are reserved. You receive a limited, non-transferable license to use the service as permitted by these Terms; no ownership is transferred.
                    </p>
                  </div>
                </div>
              </div>
              <p style={{ color: '#64748b' }}>
                If you have questions about permitted use or need a specific permission, please contact the owner using the channels provided to authorised users.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>1A. Independence</h3>
              <p style={{ color: '#64748b' }}>
                CareAssurance is provided by Lewis Barron in his personal capacity and is not offered on behalf of any employer or other organisation. Use of the platform does not confer any rights to the underlying intellectual property, brand, or design.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>2. Authorization and Access</h3>
              <p style={{ color: '#64748b' }}>
                Access is provided to authorised users to support their work. By using this software, you acknowledge and agree that:
              </p>
              <ul className="list-disc pl-6 space-y-2" style={{ color: '#64748b' }}>
                <li>The Owner may suspend or revoke access where misuse, security risk, or breach of these Terms is reasonably suspected.</li>
                <li>Where practicable, notice will be given before suspension or termination; urgent security or compliance issues may require immediate action.</li>
                <li>Upon termination, access ends and cached or temporary data will be cleared in line with our retention approach.</li>
                <li>If you believe access was ended in error, contact the Owner through the usual support channel for review.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>3. Acceptance of Terms</h3>
              <p style={{ color: '#64748b' }}>
                By accessing, browsing, or using CareAssurance ("the Software," "the Platform," or "the Service"), you ("the User," "you," or "your") acknowledge that you have read, understood, and agree to be legally bound by these Terms and Conditions ("Terms"), along with our Privacy Policy, which is incorporated herein by reference.
              </p>
              <p style={{ color: '#64748b' }}>
                If you do not agree to these Terms in their entirety, you must immediately cease all use of the Software. Your continued use of the Platform constitutes ongoing acceptance of these Terms and any subsequent modifications thereto.
              </p>
              <p style={{ color: '#64748b' }}>
                These Terms constitute a legally binding agreement between you and Lewis Barron. If you are using this Software on behalf of an organization, you represent and warrant that you have the authority to bind that organization to these Terms.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>4. Service Description</h3>
              <p style={{ color: '#64748b' }}>
                CareAssurance is a compliance management, document analysis, and audit assistance tool designed for use by care facilities, domiciliary care providers, and healthcare organizations. The Platform provides the following functionalities:
              </p>
              <ul className="list-disc pl-6 space-y-2" style={{ color: '#64748b' }}>
                <li>Document analysis and parsing of care-related documentation</li>
                <li>Care plan enhancement and optimization suggestions</li>
                <li>Risk assessment generation assistance</li>
                <li>Electronic Medication Administration Record (EMAR) auditing</li>
                <li>Visit record reconciliation and analysis</li>
                <li>AI-powered compliance recommendations</li>
                <li>Care worker performance analytics</li>
                <li>Service user documentation management</li>
              </ul>
              <p className="mt-4" style={{ color: '#64748b' }}>
                <strong style={{ color: '#d97706' }}>Critical Understanding:</strong> This Software is designed exclusively as a <strong>decision-support and administrative assistance tool</strong>. It is NOT intended to replace, substitute, or override the professional judgment of qualified healthcare professionals, registered nurses, clinical practitioners, or any other licensed professional. All outputs from this system require human review and validation before implementation.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>5. Assistive Tool Disclaimer</h3>
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                <p className="font-medium mb-2" style={{ color: '#d97706' }}>THIS SOFTWARE IS AN ASSISTIVE TOOL ONLY</p>
                <p className="text-sm" style={{ color: '#78350f' }}>
                  CareAssurance provides AI-generated suggestions, analyses, and recommendations that are intended solely to assist qualified professionals in their decision-making processes. Under no circumstances should the outputs of this system be considered as:
                </p>
                <ul className="list-disc pl-6 text-sm space-y-1 mt-2" style={{ color: '#78350f' }}>
                  <li>Medical advice, diagnosis, or treatment recommendations</li>
                  <li>Legal advice or regulatory compliance certification</li>
                  <li>A substitute for professional clinical assessment</li>
                  <li>Authoritative guidance for care delivery</li>
                  <li>Definitive compliance documentation</li>
                </ul>
              </div>
              <p style={{ color: '#64748b' }}>
                All users must independently verify, validate, and approve any outputs generated by this system before taking action. The responsibility for patient care, regulatory compliance, and professional standards rests entirely with the qualified professionals using this tool.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>6. User Responsibilities</h3>
              <p style={{ color: '#64748b' }}>By using this Software, you agree to and accept the following responsibilities:</p>
              <ul className="list-disc pl-6 space-y-2" style={{ color: '#64748b' }}>
                <li>Ensuring you have proper authorization, licensing, and professional qualifications to access and process the documents you upload</li>
                <li>Obtaining all necessary consents from data subjects before uploading their personal or health information</li>
                <li>Verifying and validating ALL AI-generated outputs before using them in any official, clinical, or regulatory capacity</li>
                <li>Maintaining the confidentiality and security of your login credentials and access tokens</li>
                <li>Complying with all applicable data protection regulations, including but not limited to the UK GDPR, Data Protection Act 2018, and relevant sector-specific regulations</li>
                <li>Ensuring that your use of the Platform complies with your organization's policies and procedures</li>
                <li>Immediately reporting any security incidents, unauthorized access, or data breaches to the platform administrator</li>
                <li>Not sharing access credentials with unauthorized individuals</li>
                <li>Using the Software only for its intended purposes as described in these Terms</li>
                <li>Assuming full responsibility for any regulatory, legal, or professional consequences arising from your use of the Platform</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>7. Regulatory Compliance Responsibility</h3>
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <p className="font-medium mb-2" style={{ color: '#dc2626' }}>USER ASSUMES ALL REGULATORY COMPLIANCE RISK</p>
                <p className="text-sm" style={{ color: '#7f1d1d' }}>
                  By using this Software, you explicitly acknowledge and agree that YOU bear sole and complete responsibility for ensuring compliance with all applicable regulations, including but not limited to CQC (Care Quality Commission) requirements, NICE guidelines, NHS standards, and any other regulatory frameworks applicable to your organization and jurisdiction.
                </p>
              </div>
              <p style={{ color: '#64748b' }}>
                The Platform does not guarantee compliance with any regulatory standard. All compliance determinations must be made by qualified professionals within your organization. Lewis Barron accepts no liability for regulatory failures, inspection outcomes, or compliance deficiencies.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>8. Prohibited Uses</h3>
              <p style={{ color: '#64748b' }}>You agree NOT to use the Software for any of the following purposes:</p>
              <ul className="list-disc pl-6 space-y-2" style={{ color: '#64748b' }}>
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
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>9. AI-Generated Content and Limitations</h3>
              <p style={{ color: '#64748b' }}>
                This Platform utilizes artificial intelligence and machine learning technologies. By using this Software, you acknowledge and understand that:
              </p>
              <ul className="list-disc pl-6 space-y-2" style={{ color: '#64748b' }}>
                <li><strong>AI Outputs May Be Inaccurate:</strong> AI-generated content may contain errors, omissions, inaccuracies, or fabricated information</li>
                <li><strong>No Guarantee of Accuracy:</strong> No representations or warranties are made regarding the accuracy, completeness, reliability, or suitability of AI-generated outputs</li>
                <li><strong>Professional Review Required:</strong> All AI outputs MUST be reviewed, verified, and approved by qualified professionals before implementation</li>
                <li><strong>Not a Substitute for Expertise:</strong> AI cannot replace human judgment, clinical expertise, or professional knowledge</li>
                <li><strong>Context Limitations:</strong> AI may not fully understand context, nuance, or specific circumstances relevant to individual cases</li>
              </ul>
              <p className="mt-4" style={{ color: '#64748b' }}>
                Lewis Barron expressly disclaims any liability arising from reliance on AI-generated content without proper professional verification.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>10. Data Handling and Volatile Storage</h3>
              <p style={{ color: '#64748b' }}>
                <strong style={{ color: '#d97706' }}>Important:</strong> All uploaded documents are stored in volatile (temporary) memory only. This "Privacy by Design" approach ensures that sensitive data is not permanently retained. Uploaded files are automatically and permanently deleted:
              </p>
              <ul className="list-disc pl-6 space-y-2" style={{ color: '#64748b' }}>
                <li>After 30 minutes of session inactivity</li>
                <li>When navigating away from the relevant section</li>
                <li>Upon session logout or browser closure</li>
                <li>When the data retention timer expires</li>
                <li>Upon user-initiated deletion</li>
              </ul>
              <p className="mt-4" style={{ color: '#64748b' }}>
                No uploaded documents are permanently stored on our servers. Users are responsible for ensuring this temporary processing meets their own data protection obligations.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>11. Intellectual Property Rights</h3>
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                <p className="font-medium mb-2" style={{ color: '#0f172a' }}>ALL RIGHTS RESERVED</p>
                <p className="text-sm" style={{ color: '#64748b' }}>
                  All content, design, functionality, code, algorithms, trademarks, logos, and other intellectual property associated with CareAssurance are exclusively owned by Lewis Barron and are protected by copyright, trademark, and other intellectual property laws. No license or right is granted to you by implication, estoppel, or otherwise except as expressly set forth in these Terms.
                </p>
              </div>
              <p style={{ color: '#64748b' }}>
                <strong>User Content:</strong> You retain ownership of documents and data you upload to the Platform. By uploading content, you grant the Platform a limited, non-exclusive, temporary license to process such content solely for the purpose of providing the Service. This license terminates upon deletion of the content.
              </p>
              <p className="mt-4" style={{ color: '#64748b' }}>
                <strong>Restrictions:</strong> You may not copy, modify, distribute, sell, or lease any part of this Software or included materials, nor may you reverse engineer or attempt to extract the source code, without express written permission from Lewis Barron.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>11A. Name, Branding, and Design Rights</h3>
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#3b82f6' }} />
                  <div>
                    <p className="font-medium mb-2" style={{ color: '#1d4ed8' }}>ORIGINAL WORK AND PROPRIETARY RIGHTS</p>
                    <p className="text-sm" style={{ color: '#334155' }}>
                      The name "CareAssurance," the CareAssurance logo, all related names, logos, product and service names, designs, user interface designs, visual elements, and all associated branding elements are the original creative works of Lewis Barron. These elements were independently conceived, created, and developed by Lewis Barron without reference to or copying of any third-party works. All rights in and to these elements are exclusively reserved.
                    </p>
                  </div>
                </div>
              </div>
              <p className="mb-4" style={{ color: '#64748b' }}>
                <strong>User Acknowledgments and Agreements:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2" style={{ color: '#64748b' }}>
                <li><strong>Original Creation:</strong> You acknowledge that the CareAssurance name, branding, and design are the original independent creations of Lewis Barron.</li>
                <li><strong>No License Granted:</strong> Nothing contained on this Platform or in these Terms should be construed as granting any license or right to use the CareAssurance name, logo, or design elements without the prior express written permission of Lewis Barron.</li>
                <li><strong>Design Rights:</strong> The visual design, layout, look and feel, color schemes, iconography, typography, and overall aesthetic of the Platform are proprietary to Lewis Barron.</li>
              </ul>
              <div className="rounded-lg p-4 mt-4 mb-4" style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <p className="font-medium mb-2" style={{ color: '#1d4ed8' }}>BRANDING AND DESIGN</p>
                <p className="text-sm" style={{ color: '#334155' }}>
                  The CareAssurance name, logo, and visual design belong to Lewis Barron. Using the platform does not grant rights to reuse or adapt these elements. If you have questions or concerns about branding or design, please contact the Owner to discuss.
                </p>
              </div>
              <p style={{ color: '#64748b' }}>
                Nothing in these Terms limits any rights you may have under applicable law; this section clarifies that branding is reserved to the Owner.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>12. Confidentiality and Non-Disclosure</h3>
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'rgba(147, 51, 234, 0.08)', border: '1px solid rgba(147, 51, 234, 0.2)' }}>
                <p className="font-medium mb-2" style={{ color: '#7c3aed' }}>BINDING CONFIDENTIALITY AGREEMENT</p>
                <p className="text-sm" style={{ color: '#4c1d95' }}>
                  By accessing this Software, you enter into a legally binding confidentiality agreement. All aspects of CareAssurance, including but not limited to its functionality, features, user interface, workflows, algorithms, methods, processes, and business model constitute Confidential Information owned exclusively by Lewis Barron.
                </p>
              </div>
              <p className="mb-4" style={{ color: '#64748b' }}>
                <strong>Confidential Information includes:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2" style={{ color: '#64748b' }}>
                <li>The concept, design, and implementation of the Software</li>
                <li>All features, functions, and capabilities observed during use</li>
                <li>Source code, algorithms, data structures, and technical architecture</li>
                <li>Business methods, pricing strategies, and operational processes</li>
                <li>Any information marked as confidential or that a reasonable person would understand to be confidential</li>
                <li>Knowledge gained through demonstrations, presentations, or access to the Platform</li>
              </ul>
              <p className="mt-4" style={{ color: '#64748b' }}>
                <strong>You agree to:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2" style={{ color: '#64748b' }}>
                <li>Keep all Confidential Information strictly confidential</li>
                <li>Not disclose any Confidential Information to any third party without prior written consent from Lewis Barron</li>
                <li>Not use Confidential Information for any purpose other than as permitted under these Terms</li>
                <li>Take all reasonable precautions to prevent unauthorized disclosure</li>
                <li>Immediately notify Lewis Barron of any unauthorized disclosure or use</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>13. Non-Copying and Non-Replication</h3>
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <p className="font-medium mb-2" style={{ color: '#dc2626' }}>ABSOLUTE PROHIBITION ON COPYING</p>
                <p className="text-sm" style={{ color: '#7f1d1d' }}>
                  You are strictly prohibited from copying, replicating, reproducing, or creating derivative works based on any aspect of CareAssurance. This prohibition applies regardless of whether you have been granted access to the Software, viewed a demonstration, or been presented with the concept in any form.
                </p>
              </div>
              <p className="mb-4" style={{ color: '#64748b' }}>
                <strong>Prohibited activities include but are not limited to:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2" style={{ color: '#64748b' }}>
                <li>Developing, commissioning, or contributing to any software, application, or service that replicates or is substantially similar to CareAssurance or any of its features</li>
                <li>Using knowledge gained from access to CareAssurance to create competing products or services</li>
                <li>Sharing information about CareAssurance with any person or entity for the purpose of enabling them to create similar software</li>
                <li>Hiring, contracting, or engaging with developers to recreate any functionality observed in CareAssurance</li>
                <li>Adapting the concepts, workflows, or methods used in CareAssurance for use in other software</li>
                <li>Assisting any third party in any activity that would violate these prohibitions</li>
              </ul>
              <p className="mt-4" style={{ color: '#64748b' }}>
                This prohibition continues indefinitely and survives termination of your access to the Software.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>14. Non-Circumvention</h3>
              <p style={{ color: '#64748b' }}>
                You agree not to circumvent, bypass, or attempt to circumvent Lewis Barron's relationship with users, customers, partners, or any business opportunities related to CareAssurance. This includes:
              </p>
              <ul className="list-disc pl-6 space-y-2" style={{ color: '#64748b' }}>
                <li>Not approaching Lewis Barron's contacts, customers, or partners to offer competing services</li>
                <li>Not using information obtained through CareAssurance to divert business opportunities</li>
                <li>Not interfering with any business relationship or prospective business relationship of Lewis Barron</li>
                <li>Not soliciting employees, contractors, or collaborators of Lewis Barron for competing projects</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>15. Consequences of Violation</h3>
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'rgba(248, 250, 252, 0.9)', border: '1px solid #e2e8f0' }}>
                <p className="font-medium mb-2" style={{ color: '#0f172a' }}>If these Terms are breached</p>
                <p className="text-sm" style={{ color: '#334155' }}>
                  Serious breaches (for example, misuse of data, unauthorised copying, or security risks) may result in suspension and, where needed, appropriate legal remedies. Our aim is to resolve issues proportionately while protecting service users, data subjects, and the platform.
                </p>
              </div>
              <p className="mt-4" style={{ color: '#64748b' }}>
                If you believe an action or notice was issued in error, please contact the Owner to discuss a resolution.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>16. Disclaimer of Warranties</h3>
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                <p className="text-sm uppercase tracking-wide font-medium mb-2" style={{ color: '#0f172a' }}>Legal Notice</p>
                <p className="text-sm" style={{ color: '#64748b' }}>
                  THE SOFTWARE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, LEWIS BARRON DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
                </p>
              </div>
              <p style={{ color: '#64748b' }}>
                You use the Software at your own risk. Lewis Barron does not warrant that the Software is suitable for use in any particular healthcare, clinical, or regulatory context.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>17. Limitation of Liability</h3>
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <p className="font-medium mb-2" style={{ color: '#dc2626' }}>LIMITATION OF LIABILITY</p>
                <p className="text-sm" style={{ color: '#7f1d1d' }}>
                  TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL LEWIS BARRON, HIS AFFILIATES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, GOODWILL, USE, DATA, OR OTHER INTANGIBLE LOSSES, REGARDLESS OF WHETHER ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
                </p>
              </div>
              <p style={{ color: '#64748b' }}>
                Lewis Barron shall not be liable for decisions made based on Platform outputs, clinical outcomes, regulatory penalties, data breaches, business interruption, loss of data, third-party claims, inaccuracies in AI-generated content, or failure to achieve compliance with any regulatory standard.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>18. Indemnification</h3>
              <p style={{ color: '#64748b' }}>
                You agree to defend, indemnify, and hold harmless Lewis Barron, his affiliates, licensors, and service providers from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable attorneys' fees) arising out of or relating to your violation of these Terms, your use of the Software, your violation of any rights of another party, your violation of any applicable laws or regulations, content or data you upload, decisions or actions taken based on Platform outputs, claims by patients or service users, or regulatory enforcement actions.
              </p>
              <p className="mt-4" style={{ color: '#64748b' }}>
                Branding and design remain with the Owner; nothing in this section changes that. If you have a concern about branding or design, raise it directly so it can be addressed.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>19. Termination</h3>
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                <p className="font-medium mb-2" style={{ color: '#d97706' }}>Service Suspension or Termination</p>
                <p className="text-sm" style={{ color: '#78350f' }}>
                  Access may be suspended or ended where there is a breach of these Terms, a security or compliance risk, or where continued use is not commercially viable. We will usually give notice and a chance to address issues unless urgent action is required to protect users or data.
                </p>
              </div>
              <p style={{ color: '#64748b' }}>
                <strong>Account Security:</strong> You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
              </p>
              <p className="mt-4" style={{ color: '#64748b' }}>
                <strong>Effect of Termination:</strong> When access ends, you must stop using the Software. Provisions that need to continue (for example, intellectual property, limitations, and confidentiality) will survive as usual under applicable law.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>20. Modifications to Terms</h3>
              <p style={{ color: '#64748b' }}>
                Lewis Barron reserves the right to modify, amend, or update these Terms at any time without prior notice. Changes will be effective immediately upon posting. Your continued use of the Software after any such changes constitutes your acceptance of the new Terms. It is your responsibility to review these Terms periodically for updates.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>21. Governing Law and Jurisdiction</h3>
              <p style={{ color: '#64748b' }}>
                These Terms shall be governed by and construed in accordance with the laws of England and Wales. Any disputes arising out of or relating to these Terms or your use of the Software shall be subject to the exclusive jurisdiction of the courts of England and Wales.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>22. Severability</h3>
              <p style={{ color: '#64748b' }}>
                If any provision of these Terms is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect. The invalid or unenforceable provision shall be modified to the minimum extent necessary to make it valid and enforceable while preserving the original intent.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>23. Entire Agreement</h3>
              <p style={{ color: '#64748b' }}>
                These Terms, together with the Privacy Policy, constitute the entire agreement between you and Lewis Barron regarding your use of the Software and supersede all prior or contemporaneous communications, representations, or agreements, whether oral or written.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>24. Contact Information</h3>
              <p style={{ color: '#64748b' }}>
                For questions regarding these Terms or to request authorization for access, please contact Lewis Barron through the designated communication channels provided to authorized users.
              </p>
            </section>

            <div className="mt-8 pt-6" style={{ borderTop: '1px solid #e2e8f0' }}>
              <p className="text-sm text-center" style={{ color: '#64748b' }}>
                CareAssurance - Proprietary Software - All Rights Reserved
              </p>
              <p className="text-sm text-center mt-1" style={{ color: '#64748b' }}>
                Owner: Lewis Barron
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
