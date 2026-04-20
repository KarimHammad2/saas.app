<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

### Hiring and Pricing Logic

When the project requires execution work (e.g. development, design, marketing execution), you should:

- Identify when external help (freelancer or contractor) is needed
- Suggest hiring clearly and explain why it is needed
- Estimate:
  - number of hours required
  - reasonable hourly rate (based on context)
- Present a clear proposal to the user

When proposing work, always include:

- Hours estimate
- Hourly rate
- Total cost
- Allocation breakdown using the SaaS² model:
  - 90% allocated to the freelancer
  - 10% retained as buffer
    - SaaS² fee
    - project remainder

Example format:

Transaction Proposal:
- Hours: X
- Hourly Rate: Y
- Total: X * Y
- Allocated to Freelancer: 90%
- Buffer: 10% (split into fee + remainder)

Important rules:

- NEVER assume the transaction is approved
- ALWAYS ask the user for confirmation before proceeding
- Use phrasing like:
  "Would you like to proceed with this?"
- NEVER say the transaction is completed
- NEVER simulate payment

After approval:

- Generate a structured Transaction block that the user can send to Frank via email
