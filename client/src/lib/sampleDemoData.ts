export const SAMPLE_CARE_PLAN_CONTENT = `Service User: M.S. (Margaret Smith)
Date of Birth: [REDACTED]
Date of Assessment: 15/12/2024

BACKGROUND INFORMATION:
Margaret is an 82-year-old widow who has lived alone in her bungalow for the past 5 years following the death of her husband. She has two adult children who live nearby and visit regularly. Margaret was a primary school teacher for 35 years and remains very proud of her career.

CURRENT HEALTH CONDITIONS:
- Type 2 Diabetes (diet controlled)
- Mild osteoarthritis affecting both knees
- Previous hip replacement (left hip, 2019)
- Mild cognitive impairment - short-term memory affected
- Hearing loss - uses hearing aids bilaterally

MOBILITY:
Margaret mobilises independently indoors using a walking frame. She requires supervision and minimal assistance with outdoor mobility. She can manage stairs slowly with the bannister but prefers to use the stairlift that was installed in 2022.

PERSONAL CARE NEEDS:
Margaret requires prompting and supervision with personal hygiene. She can wash herself with adapted equipment but needs assistance with back and feet. She is independent with toileting during the day but uses incontinence pads at night as a precaution.

MEDICATION:
Current medications include:
- Metformin 500mg twice daily with meals
- Paracetamol 1g PRN for joint pain (max 4g in 24 hours)
- Vitamin D3 supplement daily
- Eye drops for dry eyes twice daily

NUTRITION:
Margaret follows a diabetic-friendly diet. She enjoys cooking simple meals but benefits from meal preparation support. She has a good appetite and maintains a healthy weight. She drinks approximately 6-8 glasses of water daily.

COMMUNICATION:
Margaret communicates well verbally when wearing her hearing aids. She may need repetition in noisy environments. She is oriented to person and place but occasionally confused about dates and recent events.

SOCIAL AND EMOTIONAL WELLBEING:
Margaret enjoys reading, watching nature documentaries, and tending to her small garden. She attends a local church group weekly and has a good network of friends. She reports feeling lonely at times, particularly in the evenings.

RISKS IDENTIFIED:
- Falls risk due to mobility issues and cognitive impairment
- Medication management concerns due to memory issues
- Risk of social isolation
- Diabetic complications if diet not monitored

GOALS:
1. Maintain current level of independence for as long as possible
2. Continue attending church group weekly
3. Manage diabetes effectively through diet
4. Stay connected with family and friends`;

export const SAMPLE_EMAR_CONTENT = `ELECTRONIC MEDICATION ADMINISTRATION RECORD (EMAR)
Facility: Oakwood Care Home
Service User: J.T. (John Thompson)
Period: 01/12/2024 - 14/12/2024

REGULAR MEDICATIONS:
-------------------
Amlodipine 5mg - Once daily (Morning)
01/12: AD | 02/12: AD | 03/12: AD | 04/12: AD | 05/12: AD
06/12: AD | 07/12: AD | 08/12: R | 09/12: AD | 10/12: AD
11/12: AD | 12/12: AD | 13/12: AD | 14/12: AD

Metformin 500mg - Twice daily (Morning/Evening)
01/12: AD/AD | 02/12: AD/AD | 03/12: AD/AD | 04/12: AD/AD | 05/12: AD/MU
06/12: AD/AD | 07/12: AD/AD | 08/12: AD/AD | 09/12: AD/AD | 10/12: AD/AD
11/12: R/AD | 12/12: AD/AD | 13/12: AD/AD | 14/12: AD/AD

Simvastatin 40mg - Once daily (Night)
01/12: AD | 02/12: AD | 03/12: AD | 04/12: AD | 05/12: AD
06/12: AD | 07/12: NH | 08/12: AD | 09/12: AD | 10/12: AD
11/12: AD | 12/12: AD | 13/12: AD | 14/12: AD

PRN MEDICATIONS:
---------------
Paracetamol 1g - PRN for pain (Max 4g/24hr, min 4hr gap)
05/12 09:30: AD - Headache reported
08/12 14:00: AD - Back pain
08/12 18:30: AD - Continuing back pain
12/12 08:00: AD - Arthritis pain in hands

Lorazepam 1mg - PRN for anxiety (Max 2mg/24hr)
03/12 22:00: AD - Anxious before bed
10/12 21:30: AD - Anxious, difficulty sleeping

CODE KEY:
AD = Administered
AS = Self-administered
R = Refused (see notes)
MU = Medication unavailable
NH = Not here (service user absent)
FA = Family administered

REFUSAL NOTES:
08/12 Amlodipine - R: Service user stated felt dizzy, refused morning medication. GP contacted, advised to monitor and retry evening.
11/12 Metformin AM - R: Service user reported nausea, did not want to take tablet. Took medication with lunch instead.`;

export const SAMPLE_SOCIAL_WORK_CONTENT = `SOCIAL WORK ASSESSMENT REPORT
Date: 10/12/2024
Assessor: Community Social Worker Team

RE: Margaret Smith (M.S.)
Address: [REDACTED]

REASON FOR REFERRAL:
Family has expressed concerns about Margaret's ability to manage independently at home following recent falls and increasing forgetfulness.

ASSESSMENT FINDINGS:

Living Situation:
Margaret lives alone in a ground-floor bungalow which she has owned for 40 years. The property is generally well-maintained with family support. A stairlift was installed in 2022, and grab rails are in place in the bathroom.

Family Support:
Daughter (Susan) visits twice weekly and assists with shopping and finances. Son (Robert) visits every Sunday and helps with garden maintenance. Both children are supportive but work full-time and have their own family commitments.

Financial Circumstances:
Margaret receives State Pension and Attendance Allowance (lower rate). She owns her property outright and has modest savings. She is eligible for local authority funded care services.

Mental Capacity:
Margaret demonstrates capacity to make decisions about her care with appropriate support. She understands information when presented clearly and can weigh options. Short-term memory difficulties mean she may need reminders.

RECOMMENDATIONS:
1. Home care package: 3 visits daily for medication prompting, meal preparation, and personal care support
2. Telecare alarm system for emergency response
3. Referral to occupational therapy for equipment assessment
4. Consideration of day centre placement 2 days per week for social interaction
5. Regular medication reviews with GP
6. Falls prevention programme referral`;

export const SAMPLE_VISIT_AUDIT_DATA = {
  careWorkerName: "Sarah Johnson",
  period: "01/12/2024 - 14/12/2024",
  visits: [
    { date: "01/12/2024", scheduledTime: "08:00", actualTime: "08:05", duration: 28, scheduledDuration: 30, notes: "Morning care routine completed" },
    { date: "01/12/2024", scheduledTime: "13:00", actualTime: "13:15", duration: 22, scheduledDuration: 30, notes: "Lunch preparation and medication prompt" },
    { date: "01/12/2024", scheduledTime: "18:00", actualTime: "18:02", duration: 29, scheduledDuration: 30, notes: "Evening meal and evening routine" },
    { date: "02/12/2024", scheduledTime: "08:00", actualTime: "08:00", duration: 30, scheduledDuration: 30, notes: "All tasks completed on time" },
    { date: "02/12/2024", scheduledTime: "13:00", actualTime: "12:45", duration: 35, scheduledDuration: 30, notes: "Extra time needed for shopping list" },
    { date: "03/12/2024", scheduledTime: "08:00", actualTime: "08:30", duration: 25, scheduledDuration: 30, notes: "Late due to traffic - informed office" },
  ]
};
