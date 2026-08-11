// src/models/auth.ts
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import type { SignOptions } from "jsonwebtoken"
import type { RowDataPacket } from "mysql2"
import type { InsertResult, AuthUser } from "../types/index.js"
import { pool } from "../config/database.js"

// ─── DB row shapes ────────────────────────────────────────────────────────────

interface AuthUserRow extends RowDataPacket {
  id: number
  username: string
  email: string
  password_hash?: string
  name: string
  is_admin: number
  created_at: Date
}

interface UserIdRow extends RowDataPacket {
  id: number
}

function toAuthUser(u: AuthUserRow): AuthUser & { password_hash?: string } {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    password_hash: u.password_hash,
    name: u.name,
    is_admin: !!u.is_admin,
    created_at: u.created_at,
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function createUser(
  username: string,
  email: string,
  password: string,
  name?: string,
): Promise<number> {
  const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(12))

  // If this is the first user in the DB, make them an admin.
  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM users`,
  )
  const existing = (countRows as any)[0]?.cnt ?? 0
  const isAdmin = existing === 0 ? 1 : 0

  const [result] = await pool.execute<InsertResult>(
    `INSERT INTO users (username, email, password_hash, name, is_admin, created_at) VALUES (?, ?, ?, ?, ?, NOW())`,
    [username, email, passwordHash, name || username, isAdmin],
  )
  return (result as unknown as InsertResult).insertId
}

export async function findUserByCredentials(
  usernameOrEmail: string,
): Promise<(AuthUser & { password_hash?: string }) | null> {
  const [users] = await pool.execute<AuthUserRow[]>(
    `SELECT id, username, email, password_hash, name, is_admin, created_at FROM users WHERE username = ? OR email = ?`,
    [usernameOrEmail, usernameOrEmail],
  )
  return users[0] ? toAuthUser(users[0]) : null
}

export async function findUserByUsername(
  username: string,
): Promise<AuthUser | null> {
  const [users] = await pool.execute<AuthUserRow[]>(
    `SELECT id, username, email, name, is_admin, created_at FROM users WHERE username = ?`,
    [username],
  )
  return users[0] ? toAuthUser(users[0]) : null
}

export async function findUserById(userId: number): Promise<AuthUser | null> {
  const [users] = await pool.execute<AuthUserRow[]>(
    `SELECT id, username, email, name, is_admin, created_at FROM users WHERE id = ?`,
    [userId],
  )
  return users[0] ? toAuthUser(users[0]) : null
}

export const verifyPassword = (
  plain: string,
  hashed: string,
): Promise<boolean> => bcrypt.compare(plain, hashed)

export function generateToken(userId: number): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as SignOptions["expiresIn"],
    algorithm: "HS256",
  })
}

export async function usernameExists(username: string): Promise<boolean> {
  const [rows] = await pool.execute<UserIdRow[]>(
    "SELECT id FROM users WHERE username = ?",
    [username],
  )
  return rows.length > 0
}

export async function emailExists(email: string): Promise<boolean> {
  const [rows] = await pool.execute<UserIdRow[]>(
    "SELECT id FROM users WHERE email = ?",
    [email],
  )
  return rows.length > 0
}

export async function changePassword(
  userId: number,
  newPassword: string,
): Promise<boolean> {
  const hash = await bcrypt.hash(newPassword, await bcrypt.genSalt(12))
  await pool.execute("UPDATE users SET password_hash = ? WHERE id = ?", [
    hash,
    userId,
  ])
  return true
}

// ─── Admin helpers
export async function setUserAdmin(userId: number, isAdmin: boolean): Promise<boolean> {
  const [result] = await pool.execute<InsertResult>(
    `UPDATE users SET is_admin = ? WHERE id = ?`,
    [isAdmin ? 1 : 0, userId],
  )
  return (result as unknown as InsertResult).affectedRows > 0
}

export async function listAdmins(): Promise<AuthUser[]> {
  const [rows] = await pool.execute<AuthUserRow[]>(
    `SELECT id, username, email, name, is_admin, created_at FROM users WHERE is_admin = 1 ORDER BY id ASC`,
  )
  return rows.map(toAuthUser)
}
