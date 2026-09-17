import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { of } from 'rxjs';
import { ApiKeyGuard } from '../../src/common/guards/api-key.guard';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { PaginationInterceptor } from '../../src/common/interceptors/pagination.interceptor';
import { applyBaseFilters } from '../../src/common/utils/query-helper.util';
import { mapBaseRefResponse } from '../../src/common/utils/response-mapper.util';
import {
  toEntityPayload,
  toTmfResource,
  nextVersion,
  applyVersionBump,
  projectFields,
} from '../../src/common/utils/tmf-resource.util';

type AnyRec = Record<string, any>;

function httpContext(req: AnyRec = {}, res: AnyRec = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  const guard = new ApiKeyGuard();
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('lets everything through when SKIP_AUTH is set', () => {
    process.env.SKIP_AUTH = 'true';
    expect(guard.canActivate(httpContext())).toBe(true);
  });

  it('accepts the configured key', () => {
    delete process.env.SKIP_AUTH;
    process.env.API_KEY = 'secret';
    expect(
      guard.canActivate(httpContext({ headers: { 'x-api-key': 'secret' } })),
    ).toBe(true);
  });

  it('falls back to the development key when API_KEY is unset', () => {
    delete process.env.SKIP_AUTH;
    delete process.env.API_KEY;
    expect(
      guard.canActivate(
        httpContext({ headers: { 'x-api-key': 'dev-key-123' } }),
      ),
    ).toBe(true);
  });

  it('rejects a wrong key', () => {
    delete process.env.SKIP_AUTH;
    process.env.API_KEY = 'secret';
    expect(() =>
      guard.canActivate(httpContext({ headers: { 'x-api-key': 'nope' } })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a missing key', () => {
    delete process.env.SKIP_AUTH;
    process.env.API_KEY = 'secret';
    expect(() => guard.canActivate(httpContext({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });
});

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  function capture(exception: HttpException) {
    const json = jest.fn();
    const res = { status: jest.fn(() => ({ json })) };
    filter.catch(exception, {
      switchToHttp: () => ({ getResponse: () => res }),
    } as never);
    return { res, body: json.mock.calls[0][0] };
  }

  it('maps a known status to its TMF reason', () => {
    const { res, body } = capture(
      new HttpException('gone wrong', HttpStatus.NOT_FOUND),
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(body).toMatchObject({
      code: '404',
      reason: 'Not Found',
      '@type': 'Error',
    });
  });

  it('joins an array of validation messages', () => {
    const { body } = capture(
      new HttpException(
        { message: ['name required', 'id invalid'] },
        HttpStatus.BAD_REQUEST,
      ),
    );
    expect(body.message).toBe('name required; id invalid');
    expect(body.reason).toBe('Bad Request');
  });

  it('falls back to Unknown for an unmapped status', () => {
    const { body } = capture(new HttpException('teapot', 418));
    expect(body.reason).toBe('Unknown');
  });
});

describe('PaginationInterceptor', () => {
  const interceptor = new PaginationInterceptor();

  it('unwraps {data,total} and sets the count headers', (done) => {
    const setHeader = jest.fn();
    const ctx = httpContext({}, { setHeader });
    interceptor
      .intercept(ctx, {
        handle: () => of({ data: [{ id: 1 }, { id: 2 }], total: 7 }),
      } as never)
      .subscribe((v) => {
        expect(v).toEqual([{ id: 1 }, { id: 2 }]);
        expect(setHeader).toHaveBeenCalledWith('X-Total-Count', '7');
        expect(setHeader).toHaveBeenCalledWith('X-Result-Count', '2');
        done();
      });
  });

  it('passes a non-paginated result straight through', (done) => {
    const ctx = httpContext({}, { setHeader: jest.fn() });
    interceptor
      .intercept(ctx, { handle: () => of({ id: 'x' }) } as never)
      .subscribe((v) => {
        expect(v).toEqual({ id: 'x' });
        done();
      });
  });

  it('passes null straight through', (done) => {
    const ctx = httpContext({}, { setHeader: jest.fn() });
    interceptor
      .intercept(ctx, { handle: () => of(null) } as never)
      .subscribe((v) => {
        expect(v).toBeNull();
        done();
      });
  });
});

describe('applyBaseFilters', () => {
  function qb() {
    return { andWhere: jest.fn(), addOrderBy: jest.fn() };
  }

  it('adds nothing for an empty query', () => {
    const q = qb();
    applyBaseFilters(q, {}, 'e');
    expect(q.andWhere).not.toHaveBeenCalled();
    expect(q.addOrderBy).not.toHaveBeenCalled();
  });

  it('filters by name, lifecycleStatus and free text', () => {
    const q = qb();
    applyBaseFilters(
      q,
      { name: 'a', lifecycleStatus: 'Active', q: 'term' },
      'e',
    );
    expect(q.andWhere).toHaveBeenCalledTimes(3);
    expect(q.andWhere.mock.calls[0][1]).toEqual({ name: '%a%' });
    expect(q.andWhere.mock.calls[2][1]).toEqual({ q: '%term%' });
  });

  it('sorts ascending and descending, honouring the column map', () => {
    const q = qb();
    applyBaseFilters(q, { sort: 'name,-created' }, 'e', {
      created: 'e.createdDate',
    });
    expect(q.addOrderBy).toHaveBeenNthCalledWith(1, 'e.name', 'ASC');
    expect(q.addOrderBy).toHaveBeenNthCalledWith(2, 'e.createdDate', 'DESC');
  });
});

describe('mapBaseRefResponse', () => {
  it('returns [] for nullish or non-array input', () => {
    expect(mapBaseRefResponse(undefined as never)).toEqual([]);
    expect(mapBaseRefResponse('nope' as never)).toEqual([]);
  });

  it('projects the ref shape and renames @referredType', () => {
    expect(
      mapBaseRefResponse([
        {
          id: '1',
          href: '/h',
          name: 'n',
          description: 'd',
          atReferredType: 'T',
        },
      ]),
    ).toEqual([
      {
        id: '1',
        href: '/h',
        name: 'n',
        description: 'd',
        '@referredType': 'T',
      },
    ]);
  });
});

describe('tmf-resource util', () => {
  it('toEntityPayload renames the @ keys and leaves others alone', () => {
    expect(
      toEntityPayload({
        '@type': 'T',
        '@baseType': 'B',
        '@schemaLocation': 'S',
        name: 'n',
      }),
    ).toEqual({
      atType: 'T',
      atBaseType: 'B',
      atSchemaLocation: 'S',
      name: 'n',
    });
  });

  it('toEntityPayload leaves a payload without @ keys untouched', () => {
    expect(toEntityPayload({ name: 'n' })).toEqual({ name: 'n' });
  });

  it('toTmfResource is the inverse', () => {
    expect(
      toTmfResource({
        atType: 'T',
        atBaseType: 'B',
        atSchemaLocation: 'S',
        id: '1',
      }),
    ).toEqual({
      '@type': 'T',
      '@baseType': 'B',
      '@schemaLocation': 'S',
      id: '1',
    });
  });

  it('toTmfResource leaves an entity without at* keys untouched', () => {
    expect(toTmfResource({ id: '1' })).toEqual({ id: '1' });
  });

  describe('nextVersion', () => {
    it('increments the minor in place', () => {
      expect(nextVersion('1.0', false)).toBe('1.1');
      expect(nextVersion('2.7', false)).toBe('2.8');
    });
    it('increments the major and resets the minor', () => {
      expect(nextVersion('1.7', true)).toBe('2.0');
    });
    it('treats missing or malformed input as 1.0', () => {
      expect(nextVersion(undefined, false)).toBe('1.1');
      expect(nextVersion('rubbish', false)).toBe('1.1');
      expect(nextVersion(undefined, true)).toBe('2.0');
    });
  });

  describe('applyVersionBump', () => {
    it('leaves the version alone when nothing changed', () => {
      expect(applyVersionBump('1.3', { a: 1 }, { a: 1 }, [])).toBe('1.3');
    });

    it('defaults to 1.0 when there is no previous version and nothing changed', () => {
      expect(applyVersionBump(undefined, { a: 1 }, { a: 1 }, [])).toBe('1.0');
    });

    it('bumps the minor for an ordinary change', () => {
      expect(applyVersionBump('1.0', { a: 1 }, { a: 2 }, [])).toBe('1.1');
    });

    it('bumps the major when a required field is emptied', () => {
      expect(
        applyVersionBump('1.4', { name: 'x' }, { name: '' }, ['name']),
      ).toBe('2.0');
      expect(
        applyVersionBump('1.4', { name: 'x' }, { name: null }, ['name']),
      ).toBe('2.0');
      expect(
        applyVersionBump('1.4', { tags: ['a'] }, { tags: [] }, ['tags']),
      ).toBe('2.0');
    });

    it('does not bump major when the required field was already empty', () => {
      expect(
        applyVersionBump('1.4', { name: '' }, { name: '' }, ['name']),
      ).toBe('1.4');
    });

    it('treats null and undefined as the same absence', () => {
      expect(applyVersionBump('1.2', { a: null }, { a: undefined }, [])).toBe(
        '1.2',
      );
    });
  });

  describe('projectFields', () => {
    const rows = [{ id: '1', href: '/h', name: 'n', description: 'd' }];

    it('returns the rows untouched when no selection is given', () => {
      expect(projectFields(rows)).toBe(rows);
    });

    it('always keeps id and href alongside the selection', () => {
      expect(projectFields(rows, 'name')).toEqual([
        { id: '1', href: '/h', name: 'n' },
      ]);
    });

    it('trims whitespace and ignores unknown fields', () => {
      expect(projectFields(rows, ' name , nope ')).toEqual([
        { id: '1', href: '/h', name: 'n' },
      ]);
    });

    it('omits id and href when the row has neither', () => {
      expect(projectFields([{ name: 'n' }], 'name')).toEqual([{ name: 'n' }]);
    });
  });
});
