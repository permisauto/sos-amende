export type { IRepository, FindManyOptions } from "./base";
export { DossierRepository, dossierRepository } from "./dossier";
export { UserRepository, userRepository } from "./user";
export { PaymentRepository, paymentRepository } from "./payment";
export { FailleJuridiqueRepository, failleJuridiqueRepository } from "./faille-juridique";

// Types réexportés pour commodité
export type {
  DossierWhereInput,
  DossierCreateInput,
  DossierUpdateInput,
  UserWhereInput,
  UserCreateInput,
  UserUpdateInput,
  PaymentWhereInput,
  PaymentCreateInput,
  PaymentUpdateInput,
  FailleJuridiqueWhereInput,
} from "./base";

export type { PublicUser, FullUser } from "./user";