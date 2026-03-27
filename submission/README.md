# Submission

## Short Description

Install and run steps are in [QUICK_START.md](/QUICK_START.md).

### Admin

Set a user as admin:

```bash
cd server
sqlite3 database.sqlite "UPDATE users SET role = 'admin' WHERE email = 'user@example.com';"
```

Remove admin:

```bash
cd server
sqlite3 database.sqlite "UPDATE users SET role = 'user' WHERE email = 'user@example.com';"
```

Log out and back in after changing the role.

### Postman

Generate an API key from the Profile page, then use:

- Header: `X-API-Key: <your_key>`
- Or: `Authorization: ApiKey <your_key>`

Useful endpoints:

`GET /api/markets`

- Example: `GET http://localhost:4001/api/markets?status=active&sortBy=createdAt&page=1`

`GET /api/markets/:id`

- Example: `GET http://localhost:4001/api/markets/1`

`POST /api/markets`

- Example body:
  ```json
  {
    "title": "Will BTC close above 100k this month?",
    "description": "Created from Postman",
    "outcomes": ["Yes", "No"]
  }
  ```

`POST /api/markets/:id/bets`

- Example body:
  ```json
  {
    "outcomeId": 1,
    "amount": 25
  }
  ```

## Images or Video Demo
