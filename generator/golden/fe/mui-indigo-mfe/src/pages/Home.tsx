import { Box, Card, CardContent, Typography } from '@mui/material';
import { Home as HomeIcon } from 'lucide-react';
import { t } from '../gen/i18n';

/** Halaman uji scaffold: empty placeholder. Emitter list/form/detail (M4) menambah halaman nyata. */
export default function HomePage() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom data-testid="home-title">
        {t('page.home')}
      </Typography>
      <Card variant="outlined">
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <HomeIcon size={18} />
          <Typography color="text.secondary">{t('appTitle')}</Typography>
        </CardContent>
      </Card>
    </Box>
  );
}