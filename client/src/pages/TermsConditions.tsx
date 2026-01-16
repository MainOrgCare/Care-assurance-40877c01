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
            
            <div className="rounded-lg p-4 mb-6" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 flex-shrink-0 mt-0.5" style={{ color: '#ef4444' }} />
                <div>
                  <p className="font-bold text-base mb-2" style={{ color: '#dc2626' }}>IMPORTANT NOTICE</p>
                  <p className="text-sm" style={{ color: '#7f1d1d' }}>
                    CareAssurance is proprietary software owned exclusively by <strong>Lewis Barron</strong>. All rights are reserved. Access to this software is granted at the sole discretion of the owner and may be revoked at any time, for any reason, without prior notice. This software is an <strong>ASSISTIVE TOOL ONLY</strong> and does not replace professional judgment. By using this service, you acknowledge and accept these terms in their entirety.
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
                      CareAssurance is proprietary software wholly owned by <strong>Lewis Barron</strong> ("the Owner"). All intellectual property rights, including but not limited to copyright, trademarks, trade secrets, patents, design rights, database rights, and all other proprietary rights in and to the software, its code, algorithms, design, documentation, and all associated materials are exclusively owned by Lewis Barron. All rights not expressly granted herein are reserved.
                    </p>
                  </div>
                </div>
              </div>
              <p style={{ color: '#64748b' }}>
                No ownership rights are transferred to users under any circumstances. Your use of this software constitutes a revocable, non-exclusive, non-transferable license that may be terminated by the Owner at any time.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>1A. Absolute Ownership and Independence</h3>
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#3b82f6' }} />
                  <div>
                    <p className="font-medium mb-2" style={{ color: '#1d4ed8' }}>SOLE OWNERSHIP REGARDLESS OF CIRCUMSTANCES</p>
                    <p className="text-sm" style={{ color: '#334155' }}>
                      CareAssurance is the <strong>sole and exclusive property of Lewis Barron</strong>, an individual person, and has <strong>no affiliation whatsoever with any company, corporation, employer, educational institution, or other organization</strong>. Lewis Barron is the sole developer, owner, and rights holder of this software.
                    </p>
                  </div>
                </div>
              </div>
              <p className="mb-4" style={{ color: '#64748b' }}>
                <strong>Ownership remains absolute under all circumstances, including but not limited to:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2" style={{ color: '#64748b' }}>
                <li><strong>Domain Network Development:</strong> If this code was developed on a computer connected to a corporate, educational, or government domain network, Lewis Barron remains the sole owner. No organization acquires any rights to this software by virtue of the development environment.</li>
                <li><strong>Employer-Provided Equipment:</strong> If this code was developed on equipment owned by, leased by, or provided by an employer or any third party, Lewis Barron remains the sole owner. No equipment provider acquires any rights to this software.</li>
                <li><strong>Work Hours or Premises:</strong> If any development occurred during work hours, on employer premises, or using employer resources, Lewis Barron remains the sole owner. This software was developed as a personal project and not within the scope of any employment.</li>
                <li><strong>Acquisition by Improper Means:</strong> If this code is obtained, accessed, copied, or acquired by any party through immoral, unethical, illegal, or improper means (including but not limited to unauthorized access, hacking, social engineering, theft, breach of confidentiality, or any form of misconduct), Lewis Barron remains the sole and absolute owner. No ownership, license, or rights of any kind transfer through such acquisition.</li>
                <li><strong>Training, Education, or Collaboration:</strong> If any knowledge, skills, or tools used in development were acquired through employment, training, or education, Lewis Barron remains the sole owner. Skills and knowledge do not transfer ownership of original works.</li>
              </ul>
              <div className="rounded-lg p-4 mt-4 mb-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <p className="font-medium mb-2" style={{ color: '#dc2626' }}>NO CORPORATE OR INSTITUTIONAL AFFILIATION</p>
                <p className="text-sm" style={{ color: '#7f1d1d' }}>
                  CareAssurance is an independent personal project. It is not affiliated with, sponsored by, endorsed by, or connected to any employer, company, institution, government body, or organization. No entity has contributed to, invested in, or acquired any stake in this software. Lewis Barron developed CareAssurance entirely in his personal capacity, and all intellectual property rights vest exclusively in Lewis Barron as an individual.
                </p>
              </div>
              <p style={{ color: '#64748b' }}>
                Any claims by any party asserting ownership, joint ownership, work-for-hire rights, or any other proprietary interest in CareAssurance based on the circumstances of its development are hereby explicitly rejected and void. Lewis Barron's sole ownership is absolute, unconditional, and not subject to dispute.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>2. Authorization and Access</h3>
              <p style={{ color: '#64748b' }}>
                Access to CareAssurance is granted solely at the discretion of Lewis Barron. By using this software, you acknowledge and agree that:
              </p>
              <ul className="list-disc pl-6 space-y-2" style={{ color: '#64748b' }}>
                <li><strong>Access is a privilege, not a right.</strong> The Owner may grant or deny access to any individual or organization at his sole discretion.</li>
                <li><strong>Termination without cause.</strong> The Owner reserves the absolute right to terminate, suspend, or revoke your access at any time, for any reason or no reason, without prior notice, explanation, or liability.</li>
                <li><strong>No refunds or compensation.</strong> Upon termination of access, you shall not be entitled to any refund, compensation, or damages of any kind.</li>
                <li><strong>Immediate effect.</strong> Termination takes effect immediately upon the Owner's decision, and you must cease all use of the software forthwith.</li>
                <li><strong>No appeals process.</strong> The Owner's decision regarding access is final and not subject to review or appeal.</li>
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
              <div className="rounded-lg p-4 mt-4 mb-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <p className="font-medium mb-2" style={{ color: '#dc2626' }}>WAIVER OF CLAIMS</p>
                <p className="text-sm" style={{ color: '#7f1d1d' }}>
                  By using this Software, you expressly acknowledge and agree that the name "CareAssurance," all logos, design elements, user interface designs, visual styling, and all other branding associated with this Platform are original works independently created by and belonging exclusively to Lewis Barron. You hereby irrevocably waive, release, and forever discharge any and all claims, actions, demands, suits, or proceedings of any kind whatsoever against Lewis Barron relating to the name, branding, or design of the Platform, including but not limited to any claims of infringement, passing off, unfair competition, or any similar claims. You agree that you shall not bring, support, participate in, or fund any legal action or proceeding against Lewis Barron relating to the Platform's name, branding, or design.
                </p>
              </div>
              <p style={{ color: '#64748b' }}>
                This waiver of claims is a material condition of your access to and use of the Platform and shall survive termination of your access indefinitely.
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
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <p className="font-medium mb-2" style={{ color: '#dc2626' }}>LEGAL ACTION AND DAMAGES</p>
                <p className="text-sm" style={{ color: '#7f1d1d' }}>
                  Any violation of the intellectual property, confidentiality, non-copying, or non-circumvention provisions of these Terms may result in immediate legal action, including but not limited to injunctive relief and claims for substantial damages.
                </p>
              </div>
              <p className="mb-4" style={{ color: '#64748b' }}>
                <strong>In the event of violation, you may be liable for:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2" style={{ color: '#64748b' }}>
                <li><strong>Injunctive Relief:</strong> Immediate court orders to cease infringing activities</li>
                <li><strong>Compensatory Damages:</strong> Full compensation for all losses suffered by Lewis Barron</li>
                <li><strong>Disgorgement of Profits:</strong> Surrender of any profits gained from the violation</li>
                <li><strong>Legal Costs:</strong> All legal fees, court costs, and expenses incurred in enforcement</li>
                <li><strong>Statutory Damages:</strong> Where applicable under intellectual property laws</li>
                <li><strong>Additional Remedies:</strong> Any other remedies available at law or in equity</li>
              </ul>
              <p className="mt-4" style={{ color: '#64748b' }}>
                Lewis Barron reserves the right to pursue all available legal remedies against any person or entity that violates these Terms, and to report violations to relevant authorities where appropriate.
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
              <div className="rounded-lg p-4 mt-4 mb-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <p className="font-medium mb-2" style={{ color: '#dc2626' }}>WAIVER AND RELEASE OF CLAIMS</p>
                <p className="text-sm" style={{ color: '#7f1d1d' }}>
                  You irrevocably waive, release, and forever discharge Lewis Barron from any and all claims, demands, actions, suits, or proceedings relating to the CareAssurance name, logo, branding, design, user interface, or any other visual or branding elements of the Platform. You agree not to bring, support, participate in, or fund any legal action against Lewis Barron relating to the Platform's name, branding, or design. This waiver shall survive termination of your access to the Platform and shall remain in full force and effect indefinitely.
                </p>
              </div>
              <p style={{ color: '#64748b' }}>
                You acknowledge that Lewis Barron has independently created the CareAssurance name, logo, and design elements as original works, and you shall not assert, support, or participate in any claim suggesting otherwise.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold" style={{ color: '#0f172a' }}>19. Termination</h3>
              <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                <p className="font-medium mb-2" style={{ color: '#d97706' }}>OWNER'S ABSOLUTE RIGHT TO TERMINATE</p>
                <p className="text-sm" style={{ color: '#78350f' }}>
                  Lewis Barron reserves the absolute and unconditional right to terminate, suspend, restrict, or revoke your access to the Software at any time, for any reason or no reason, with or without notice, and without any liability whatsoever. This includes but is not limited to termination for breach of Terms, suspected misuse, business reasons, or at the Owner's sole discretion.
                </p>
              </div>
              <p style={{ color: '#64748b' }}>
                <strong>Account Security:</strong> You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
              </p>
              <p className="mt-4" style={{ color: '#64748b' }}>
                <strong>Effect of Termination:</strong> Upon termination, you must immediately cease all use of the Software. All provisions of these Terms which by their nature should survive termination shall survive, including ownership provisions, warranty disclaimers, indemnity, and limitations of liability.
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
