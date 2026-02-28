import fs from 'fs';

let content = fs.readFileSync('server/services/emarAgent.ts', 'utf8');

const metadataSchemaStr = `const metadataSchema = {
  name: "EMARMetadata",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["serviceUserInitials", "allergies", "medications", "dates", "timeSlots"],
    properties: {
      serviceUserInitials: { type: "string" },
      allergies: { type: "string" },
      medications: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "genericName", "isPRN", "instructions", "requiredGapHours", "scheduledTimeSlots"],
          properties: {
            name: { type: "string" },
            genericName: { type: "string" },
            isPRN: { type: "boolean" },
            instructions: { type: "string" },
            requiredGapHours: { type: "number" },
            scheduledTimeSlots: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      },
      dates: {
        type: "array",
        items: { type: "string" }
      },
      timeSlots: {
        type: "array",
        items: { type: "string" }
      }
    }
  }
};
`;

const entriesSchemaStr = `const entriesSchema = {
  name: "EMAREntries",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["entries"],
    properties: {
      entries: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["medicationId", "date", "timeSlot", "code", "careWorkerInitials", "time", "hasTime", "isOfficeClosed", "closedByStaff", "closedTime"],
          properties: {
            medicationId: { type: "number" },
            date: { type: "string" },
            timeSlot: { type: "string" },
            code: { type: "string" },
            careWorkerInitials: { type: "string" },
            time: { type: "string" },
            hasTime: { type: "boolean" },
            isOfficeClosed: { type: "boolean" },
            closedByStaff: { type: "string" },
            closedTime: { type: "string" }
          }
        }
      }
    }
  }
};
`;

// Insert the schemas near the top
content = content.replace('export const emarAgent = {', metadataSchemaStr + '\n' + entriesSchemaStr + '\nexport const emarAgent = {');

// Update responseFormat for metadata
content = content.replace(/responseFormat: \{ type: "json_object" \},/g, (match, offset) => {
  if (content.substring(offset - 200, offset + 200).includes('emar_agent_metadata_pass')) {
    return 'responseFormat: { type: "json_schema", json_schema: metadataSchema },';
  } else if (content.substring(offset - 200, offset + 200).includes('emar_agent_entries_pass')) {
    return 'responseFormat: { type: "json_schema", json_schema: entriesSchema },';
  }
  return match;
});

fs.writeFileSync('server/services/emarAgent.ts', content);
