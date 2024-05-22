# Define default PATH once for all targets that need it. This doesn't set PATH for the shell, only for the makefile.
export PATH := $(HOME)/.local/bin:$(PATH)

# Define default target that runs all steps for non workstations.
all: cleanup setup install

# Define the `work` target that installs ansible on the workstation and runs the setup playbook.
workstation:
	python3 -m pip install --user ansible
	@$(MAKE) setup_internal

# Define the `cleanup` target that runs the cleanup playbook.
cleanup:
	ansible-playbook playbooks/cleanup.yml -K

# Define the `setup` target that runs the cleanup and setup playbooks.
setup: cleanup setup_internal

# Define the `setup_internal` target that runs the setup playbook.
setup_internal:
	ansible-playbook playbooks/setup.yml

# Define the `install` target that runs the install playbook.
install:
	ansible-playbook playbooks/install.yml
