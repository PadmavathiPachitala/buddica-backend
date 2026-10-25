# AI USAGE SUMMARY SHEET

**Fintech Wallet & RBAC API** | Technical Assessment

| Field | Details |
| :--- | :--- |
| **Prepared by** | Padmavathi |
| **Date** | 25 October 2026 |
| **Organisation** | Buddica Global Solutions Pvt. Ltd. |
| **Stack** | Node.js, Express 5, MongoDB, Mongoose, JWT |
| **AI Tools Used** | ChatGPT, Gemini |
| **Project Type** | Backend REST API (wallet, RBAC, audit log) |

---

## 1. Summary

In short: AI assistance was utilized specifically for documentation, test-case drafting, and Postman scripts. System design, implementation, debugging, environment setup, and verification testing were performed manually by me.

---

## 2. Areas Where AI Assistance Was Taken

| Area | How AI Was Used | My Part |
| :--- | :--- | :--- |
| **Test Cases** | Suggested and drafted unit and integration test cases and boilerplate for validators, middleware, services, and API routes. | Ran the full suite and reviewed the results. |
| **README.md** | Helped structure and draft sections: features, endpoint reference, architecture diagram, setup steps. | Checked content against the code and Postman collection. |
| **Postman Collection** | Helped write request bodies and test scripts. | Imported the collection and ran the requests. |

---

## 3. Work Done Manually by Me

| Area | What I Did |
| :--- | :--- |
| **Requirements & Role Design** | Analysed the assignment and decided the customer / support / admin permission model. |
| **Data & Financial Design** | Chose integer paise for money, one wallet per customer, the transaction status flow, and the audit-log fields. |
| **Implementation** | Built the auth, wallet transfer, admin, and middleware modules, including idempotency keys and overdraft protection. |
| **Debugging** | Found and fixed errors and failing tests myself, including edge cases in idempotency, reversals, and password handling. |
| **Environment Setup** | Set up the local MongoDB replica set (`rs0`), backups, and separate test database; configured `.env`, JWT secret, rate limits, and the admin and support seed accounts. |
| **Testing & Submission** | Ran the automated tests and Postman flows to check roles, reversals, and rate limiting; managed git history, cleanup, and final packaging. |
