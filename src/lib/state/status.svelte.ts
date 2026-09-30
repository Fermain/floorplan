export type Status = { text: string; error: boolean }

let status = $state<Status>({ text: '', error: false })

export const statusLine = {
  get text() {
    return status.text
  },
  get error() {
    return status.error
  },
  set(next: Status) {
    status = next
  },
  clear() {
    status = { text: '', error: false }
  },
}
