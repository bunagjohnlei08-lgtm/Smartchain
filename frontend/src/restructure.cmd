# Create directories
mkdir -p "page/super-admin/warehouse"
mkdir -p "page/super-admin/settings"

# Move settings files
move "page/settings/*" "page/super-admin/settings/"

# Move warehouse files  
move "page/warehouse/*" "page/super-admin/warehouse/"