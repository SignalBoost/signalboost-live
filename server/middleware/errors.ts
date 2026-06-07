import type { NextFunction, Request, Response } from 'express'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` })
}

export function errorHandler(error: Error, _req: Request, res: Response, _next: NextFunction) {
  const status = error instanceof ApiError ? error.status : 500
  res.status(status).json({ error: error.message || 'Internal server error' })
}
