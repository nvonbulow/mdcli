import { Schema } from "effect"

type U = A | B

interface A {
  readonly a: string
  readonly next: U
}
interface B {
  readonly b: number
  readonly next: U
}

const URef = Schema.suspend((): Schema.Codec<U> => U)

const A: Schema.Codec<A> = Schema.Struct({
  a: Schema.String,
  next: URef
})

const B: Schema.Codec<B> = Schema.Struct({
  b: Schema.Number,
  next: URef
})

const U: Schema.Codec<U> = Schema.Union([A, B])
