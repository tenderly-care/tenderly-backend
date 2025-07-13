import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../modules/users/schemas/user.schema';

export const GetUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext): User | any => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
