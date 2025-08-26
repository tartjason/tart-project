# Comments API Contract (Phase 1)

Goal: support read-first UI with pagination, then basic create, like, reply, and delete. Keep payloads small and stable.

## Entities

Comment
- _id: string (ObjectId)
- artworkId: string (ObjectId)
- author: { _id, username, name?, profilePictureUrl? }
- text: string (1..1000)
- likesCount: number
- likedByMe: boolean (auth optional; false when unauth)
- createdAt: ISO string
- repliesCount: number
- replies?: Reply[] (optional inline, small pages only)

Reply
- _id, parentCommentId, author, text, likesCount, likedByMe, createdAt

## Endpoints

GET /api/artworks/:artworkId/comments?cursor=&limit=
- Auth: optional
- Query
  - limit: int (default 10, max 50)
  - cursor: opaque string (server-issued, e.g., createdAt_id)
- 200
  {
    comments: Comment[],
    nextCursor: string | null
  }
- 404 if artwork not found

POST /api/artworks/:artworkId/comments
- Auth: required
- Body: { text: string }
- 201 { comment: Comment }
- 400 on validation error; 404 if artwork not found

POST /api/comments/:commentId/replies
- Auth: required
- Body: { text: string }
- 201 { reply: Reply }
- 404 if parent comment not found/not under artwork

PUT /api/comments/:commentId/like
- Auth: required
- Body: { like: boolean } // true=like, false=unlike
- 200 { likesCount: number, likedByMe: boolean }
- 404 if comment/reply not found

DELETE /api/comments/:commentId
- Auth: required
- Rules: author OR artwork author (artist) may delete; otherwise 403
- 204 on success; 404 if not found

GET /api/comments/:commentId/replies?cursor=&limit=
- Auth: optional
- 200 { replies: Reply[], nextCursor: string | null }

## Notes
- Pagination: cursor-based; server returns nextCursor or null.
- Ordering: newest-first for top-level comments; replies oldest-first under each comment.
- Rate limits: consider per-IP and per-user to prevent spam.
- Validation: trim text; reject empty; enforce max len ~1000.
- Security: sanitize text and enforce auth/ownership checks for delete and like.
- Compatibility: frontend currently accepts either array ([]) or an object with { comments, nextCursor } for GET list.
